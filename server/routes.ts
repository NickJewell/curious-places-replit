import type { Express } from "express";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── InWorldTTS helpers ──────────────────────────────────────────────────────

const AUDIO_CACHE_BUCKET = 'en_audio';
const LOADING_MESSAGE_FILE = 'en_loading_overview.mp3';
const LOADING_MESSAGE_TEXT =
  "I'm just getting information on this place - I'll be ready in a moment.";

async function callInWorldTTS(
  text: string,
  voiceId: string,
  inworldApiKey: string,
): Promise<Buffer | null> {
  const r = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${inworldApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      audio_config: { audio_encoding: 'MP3', speaking_rate: 1 },
      temperature: 1.1,
      model_id: 'inworld-tts-1.5-max',
    }),
  });
  if (!r.ok) { console.error('InWorldTTS error:', r.status, await r.text().catch(() => '')); return null; }
  const json = await r.json() as { audioContent?: string };
  if (!json.audioContent) return null;
  return Buffer.from(json.audioContent, 'base64');
}

async function audioFileExists(fileName: string, bucket: string = AUDIO_CACHE_BUCKET): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list('', { search: fileName });
  return !error && !!data && data.some((f: any) => f.name === fileName);
}

async function signAudioUrl(fileName: string, bucket: string = AUDIO_CACHE_BUCKET): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileName, 3600);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

async function uploadAudioBuffer(fileName: string, buffer: Buffer, bucket: string = AUDIO_CACHE_BUCKET): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, buffer, { contentType: 'audio/mpeg', upsert: false });
  if (error) {
    const isDupe =
      error.message?.toLowerCase().includes('already exists') ||
      (error as any)?.statusCode === '409' ||
      (error as any)?.error === 'Duplicate';
    if (!isDupe) throw error;
  }
}

/** Per-language TTS configuration for detail_overview narration. */
const LANG_AUDIO_CONFIGS: Record<string, { column: string; voice: string; bucket: string }> = {
  fr: { column: 'fr_detail_overview', voice: 'Hélène', bucket: 'fr_audio' },
  de: { column: 'de_detail_overview', voice: 'Johanna', bucket: 'de_audio' },
  it: { column: 'it_detail_overview', voice: 'Orietta', bucket: 'it_audio' },
  pt: { column: 'pt_detail_overview', voice: 'Beatriz', bucket: 'pt_audio' },
  es: { column: 'es_detail_overview', voice: 'Sofia', bucket: 'es_audio' },
  ja: { column: 'ja_detail_overview', voice: 'Asuka', bucket: 'ja_audio' },
  ar: { column: 'ar_detail_overview', voice: 'Nour', bucket: 'ar_audio' },
  zh: { column: 'zh_detail_overview', voice: 'Xiaoyin', bucket: 'zh_audio' },
  ko: { column: 'ko_detail_overview', voice: 'Minji', bucket: 'ko_audio' },
  hi: { column: 'hi_detail_overview', voice: 'Riya', bucket: 'hi_audio' },
};

/** Ensures a Supabase storage bucket exists, creating it (public=false) if absent. */
async function ensureBucket(bucket: string): Promise<void> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error(`[bucket] Failed to list buckets:`, listErr.message);
    return;
  }
  const exists = buckets?.some((b: any) => b.name === bucket);
  if (!exists) {
    console.log(`[bucket] Creating missing bucket: ${bucket}`);
    const { error: createErr } = await supabase.storage.createBucket(bucket, { public: false });
    if (createErr) {
      console.error(`[bucket] Failed to create ${bucket}:`, createErr.message);
    } else {
      console.log(`[bucket] Created ${bucket}`);
    }
  }
}

/** Returns a signed URL for the loading message, generating it once if absent. */
async function getLoadingMessageUrl(inworldApiKey: string): Promise<string | null> {
  if (!(await audioFileExists(LOADING_MESSAGE_FILE))) {
    const buf = await callInWorldTTS(LOADING_MESSAGE_TEXT, 'Olivia', inworldApiKey);
    if (!buf) return null;
    await uploadAudioBuffer(LOADING_MESSAGE_FILE, buf);
  }
  return signAudioUrl(LOADING_MESSAGE_FILE);
}

// ─────────────────────────────────────────────────────────────────────────────

// Calculate distance between two points in meters using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Admin API: Get places that need detail_overview (null), sorted by box_id
  app.get('/api/admin/places/needs-overview', async (req, res) => {
    try {
      // First get total count
      const { count } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true })
        .is('detail_overview', null);

      // Get records with null detail_overview
      const { data, error } = await supabase
        .from('places')
        .select('places_id, curio_id, name, plus_code, detail_overview')
        .is('detail_overview', null);

      if (error) {
        console.error('Error fetching places:', error);
        return res.status(500).json({ error: error.message });
      }

      // Sort by numeric part of curio_id (e.g., CURIO-190 → 190)
      const sorted = (data || []).sort((a: any, b: any) => {
        const numA = parseInt((a['curio_id'] || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b['curio_id'] || '').replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      // Limit to first 10
      const limited = sorted.slice(0, 10);

      res.json({ places: limited, total: count || 0 });
    } catch (err) {
      console.error('Error in needs-overview:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Update a place's detail_overview
  app.patch('/api/admin/places/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { 'detail_overview': detailOverview } = req.body;

      console.log('Updating place:', id, 'with detail_overview:', detailOverview?.substring(0, 50));

      // First verify the record exists
      const { data: existing, error: fetchError } = await supabase
        .from('places')
        .select('places_id, name')
        .eq('places_id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching place:', fetchError);
        return res.status(404).json({ error: 'Place not found: ' + fetchError.message });
      }

      console.log('Found existing place:', (existing as any)?.name);

      // Use upsert-like approach - update with returning
      const { error: updateError } = await supabase
        .from('places')
        .update({ 'detail_overview': detailOverview })
        .eq('places_id', id);

      if (updateError) {
        console.error('Error updating place:', updateError);
        return res.status(500).json({ error: updateError.message });
      }

      res.json({ success: true, place: { ...(existing as any), 'detail_overview': detailOverview } });
    } catch (err) {
      console.error('Error updating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Extract all columns from places table by curio_id
  app.get('/api/admin/places/extract/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;

      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('curio_id', curioId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: `Place with curio_id "${curioId}" not found` });
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Lookup a place by curio_id
  app.get('/api/admin/places/lookup/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      const { data, error } = await supabase
        .from('places')
        .select('places_id, curio_id, name, detail_overview')
        .eq('curio_id', curioId)
        .single();

      if (error) {
        return res.status(404).json({ error: 'Place not found' });
      }

      res.json({ place: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/places/:curioId/audio-url', async (req, res) => {
    try {
      const { curioId } = req.params;
      console.log(`[audio-url] curioId=${curioId} lang=${req.query.lang ?? '(none)'}`);

      const match = curioId.match(/(\d+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid curio ID format' });
      }

      const num = parseInt(match[1], 10);

      // Resolve language config (defaults to English for any unsupported lang)
      const reqLang = (req.query.lang as string) || 'en';
      const langKey = LANG_AUDIO_CONFIGS[reqLang] ? reqLang : 'en';
      const langCfg = LANG_AUDIO_CONFIGS[langKey] ?? {
        column: 'detail_overview',
        voice: 'Olivia',
        bucket: AUDIO_CACHE_BUCKET,
      };
      const cacheFileName = `${langKey}_curio_${num}_detail_overview.mp3`;

      // Cache hit — respond immediately
      if (await audioFileExists(cacheFileName, langCfg.bucket)) {
        const url = await signAudioUrl(cacheFileName, langCfg.bucket);
        if (!url) return res.status(404).json({ error: 'Audio not available for this place' });
        return res.json({ url, isReady: true });
      }

      // Cache miss — generate real audio in background
      const inworldApiKey = process.env.INWORLD_API_KEY;
      if (!inworldApiKey) {
        console.error('INWORLD_API_KEY is not set');
        return res.status(404).json({ error: 'Audio not available for this place' });
      }

      // Fire-and-forget: generate and cache the narration
      (async () => {
        try {
          console.log(`[TTS] Starting ${langKey} generation for ${curioId}, column: ${langCfg.column}, voice: ${langCfg.voice}`);
          const { data: placeRow, error: dbError } = await supabase
            .from('places')
            .select(langCfg.column)
            .eq('curio_id', curioId)
            .single();
          if (dbError) {
            console.error(`[TTS] DB error for ${curioId}:`, dbError);
            return;
          }
          const text = (placeRow as any)?.[langCfg.column];
          if (!text) {
            console.error(`[TTS] No text found for ${curioId} in column "${langCfg.column}"`);
            return;
          }
          console.log(`[TTS] Got text (${text.length} chars), calling InWorld…`);
          const buf = await callInWorldTTS(text, langCfg.voice, inworldApiKey);
          if (!buf) {
            console.error(`[TTS] InWorld returned null buffer for ${curioId} (${langKey})`);
            return;
          }
          console.log(`[TTS] Uploading ${buf.length}b → ${langCfg.bucket}/${cacheFileName}`);
          await ensureBucket(langCfg.bucket);
          await uploadAudioBuffer(cacheFileName, buf, langCfg.bucket);
          console.log(`[TTS] Done: ${cacheFileName}`);
        } catch (err) {
          console.error('Background TTS failed for', curioId, langKey, err);
        }
      })();

      // English: play the loading message while generating
      // Non-English: return null URL so client polls silently (no English loading message)
      if (langKey === 'en') {
        const loadingUrl = await getLoadingMessageUrl(inworldApiKey);
        if (!loadingUrl) return res.status(404).json({ error: 'Audio not available for this place' });
        return res.json({ url: loadingUrl, isReady: false });
      }

      return res.json({ url: null, isReady: false });
    } catch (error) {
      console.error('Error generating audio URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/places/:curioId/fact-audio/:factId', async (req, res) => {
    try {
      const { curioId, factId } = req.params;

      const curioMatch = curioId.match(/(\d+)$/);
      if (!curioMatch) {
        return res.status(400).json({ error: 'Invalid curio ID format' });
      }

      const curioNum = parseInt(curioMatch[1], 10);
      const cacheBucket = 'en_audio';

      // Fetch all facts for the curio ordered consistently so position is stable
      const { data: allFacts, error: allFactsError } = await supabase
        .from('facts')
        .select('id, fact_info')
        .eq('curio_id', curioId)
        .order('created_at', { ascending: true });

      if (allFactsError || !allFacts || allFacts.length === 0) {
        console.error('Could not fetch facts for curio:', curioId, allFactsError);
        return res.status(404).json({ error: 'Fact audio not available' });
      }

      const factIndex = allFacts.findIndex((f: any) => f.id === factId);
      if (factIndex === -1) {
        console.error('Fact not found in curio:', factId, curioId);
        return res.status(404).json({ error: 'Fact audio not available' });
      }

      const factText = allFacts[factIndex].fact_info;
      if (!factText) {
        console.error('Empty fact_info for fact:', factId);
        return res.status(404).json({ error: 'Fact audio not available' });
      }

      const paddedFact = String(factIndex + 1).padStart(2, '0');
      const cacheFileName = `en_curio_${curioNum}_fact_${paddedFact}_v2.mp3`;

      // Cache hit — respond immediately
      if (await audioFileExists(cacheFileName)) {
        const url = await signAudioUrl(cacheFileName);
        if (!url) return res.status(404).json({ error: 'Fact audio not available' });
        return res.json({ url, isReady: true });
      }

      // Cache miss — generate synchronously (facts are short, ~2 s)
      const inworldApiKey = process.env.INWORLD_API_KEY;
      if (!inworldApiKey) {
        console.error('INWORLD_API_KEY is not set');
        return res.status(404).json({ error: 'Fact audio not available' });
      }

      const sanitizedFactText = factText.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
      if (!sanitizedFactText) return res.status(404).json({ error: 'Fact audio not available' });

      const buf = await callInWorldTTS(sanitizedFactText, 'Clive', inworldApiKey);
      if (!buf) return res.status(404).json({ error: 'Fact audio not available' });

      await uploadAudioBuffer(cacheFileName, buf);

      const url = await signAudioUrl(cacheFileName);
      if (!url) return res.status(404).json({ error: 'Fact audio not available' });

      return res.json({ url, isReady: true });
    } catch (error) {
      console.error('Error generating fact audio URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get random facts for a place
  app.get('/api/places/:curioId/facts', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      const { data, error } = await supabase
        .from('facts')
        .select('*')
        .eq('curio_id', curioId);

      if (error) {
        console.log('Facts table may not exist:', error.message);
        return res.json({ facts: [] });
      }

      res.json({ facts: data || [] });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Submit content vote (thumbs up/down)
  app.post('/api/content/vote', async (req, res) => {
    try {
      const { curioId, voteType, userId } = req.body;
      
      if (!curioId || !voteType) {
        return res.status(400).json({ error: 'curioId and voteType are required' });
      }

      const { data, error } = await supabase
        .from('content_votes')
        .insert({
          curio_id: curioId,
          vote_type: voteType,
          user_id: userId || null,
        })
        .select()
        .single();

      if (error) {
        console.log('Vote error (table may not exist):', error.message);
        return res.status(500).json({ error: 'Could not save vote. Table may not exist.' });
      }

      res.json({ success: true, vote: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Remove content vote
  app.delete('/api/content/vote', async (req, res) => {
    try {
      const { curioId, voteType, userId } = req.body;
      
      if (!curioId || !voteType) {
        return res.status(400).json({ error: 'curioId and voteType are required' });
      }

      // Build query to find and delete the vote
      let query = supabase
        .from('content_votes')
        .delete()
        .eq('curio_id', curioId)
        .eq('vote_type', voteType);
      
      // If userId provided, match it; otherwise match null
      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.is('user_id', null);
      }

      const { error } = await query;

      if (error) {
        console.log('Vote delete error:', error.message);
        return res.status(500).json({ error: 'Could not remove vote.' });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Submit content issue
  app.post('/api/content/issue', async (req, res) => {
    try {
      const { sourceType, sourceId, issueType, otherDesc, userId } = req.body;
      
      if (!sourceId || !issueType) {
        return res.status(400).json({ error: 'sourceId and issueType are required' });
      }

      const row: Record<string, any> = {
        source_id: sourceId,
        source_type: sourceType || 'place',
        issue_type: issueType,
        user_id: userId || null,
      };
      if (issueType === 'other' && otherDesc) {
        row.other_desc = String(otherDesc).slice(0, 200);
      }

      const { data, error } = await supabase
        .from('issues')
        .insert(row)
        .select()
        .single();

      if (error) {
        console.log('Issue insert error:', error.message);
        return res.status(500).json({ error: 'Could not save issue.' });
      }

      res.json({ success: true, issue: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Get curio with place and facts by curio_id
  app.get('/api/admin/curio/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;
      
      // Get the place
      const { data: place, error: placeError } = await supabase
        .from('places')
        .select('*')
        .eq('curio_id', curioId)
        .single();

      if (placeError) {
        return res.status(404).json({ error: 'Place not found' });
      }

      // Get the facts
      const { data: facts, error: factsError } = await supabase
        .from('facts')
        .select('*')
        .eq('curio_id', curioId);

      res.json({ 
        place, 
        facts: factsError ? [] : (facts || []) 
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Create a new fact
  app.post('/api/admin/facts', async (req, res) => {
    try {
      const { 'curio_id': curioId, fact } = req.body;
      
      if (!curioId || !fact) {
        return res.status(400).json({ error: 'curio_id and fact are required' });
      }

      const { data, error } = await supabase
        .from('facts')
        .insert({ 'curio_id': curioId, 'fact_info': fact })
        .select()
        .single();

      if (error) {
        console.error('Error creating fact:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, fact: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Update a fact
  app.patch('/api/admin/facts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { fact: factText } = req.body;
      
      if (!factText) {
        return res.status(400).json({ error: 'fact is required' });
      }

      // First get the current fact to check the column structure
      const { data: existingFact, error: fetchError } = await supabase
        .from('facts')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching fact:', fetchError);
        return res.status(404).json({ error: 'Fact not found' });
      }

      // Log the column names to debug
      console.log('Existing fact columns:', Object.keys(existingFact || {}));

      // Try to determine the correct column name
      const columnName = Object.keys(existingFact || {}).find(k => 
        k === 'fact' || k === 'content' || k === 'text' || k === 'fact_text' || k === 'fact_info'
      ) || 'fact_info';

      console.log('Using column name:', columnName);

      const updateData: Record<string, string> = {};
      updateData[columnName] = factText;

      const { error } = await supabase
        .from('facts')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Error updating fact:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Delete a fact
  app.delete('/api/admin/facts/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from('facts')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting fact:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Create a new place with auto-generated curio_id
  app.post('/api/admin/place', async (req, res) => {
    try {
      const { lat, lon, name } = req.body;

      if (lat == null || lon == null) {
        return res.status(400).json({ error: 'lat and lon are required' });
      }

      // Find the highest existing curio_id number
      const { data: maxRows, error: maxError } = await supabase
        .from('places')
        .select('curio_id')
        .order('curio_id', { ascending: false })
        .limit(200);

      if (maxError) {
        console.error('Error finding max curio_id:', maxError);
        return res.status(500).json({ error: maxError.message });
      }

      let maxNum = 0;
      for (const row of (maxRows || [])) {
        const num = parseInt((row.curio_id || '').replace(/\D/g, '')) || 0;
        if (num > maxNum) maxNum = num;
      }
      const newCurioId = `CURIO-${maxNum + 1}`;

      const { data, error } = await supabase
        .from('places')
        .insert({
          curio_id: newCurioId,
          name: name || 'New Place',
          lat: lat,
          lon: lon,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating place:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, place: data, curioId: newCurioId });
    } catch (err) {
      console.error('Error creating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Update place name
  app.patch('/api/admin/place/:curioId/name', async (req, res) => {
    try {
      const { curioId } = req.params;
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const { data, error } = await supabase
        .from('places')
        .update({ name })
        .eq('curio_id', curioId)
        .select()
        .single();

      if (error) {
        console.error('Error updating place name:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, place: data });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Delete a place and all its related facts by curio_id
  app.delete('/api/admin/place/:curioId', async (req, res) => {
    try {
      const { curioId } = req.params;

      const { error: factsError } = await supabase
        .from('facts')
        .delete()
        .eq('curio_id', curioId);

      if (factsError) {
        console.error('Error deleting facts:', factsError);
      }

      const { error: placeError } = await supabase
        .from('places')
        .delete()
        .eq('curio_id', curioId);

      if (placeError) {
        console.error('Error deleting place:', placeError);
        return res.status(500).json({ error: placeError.message });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Get places near a point (within specified radius in meters)
  app.get('/api/admin/places/nearby', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const radius = parseFloat(req.query.radius as string) || 250;

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'lat and lon are required' });
      }

      // Fetch ALL places by paginating through all records
      let allPlaces: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error: fetchError } = await supabase
          .from('places')
          .select('places_id, curio_id, name, lat, lon, plus_code')
          .range(from, from + pageSize - 1);

        if (fetchError) {
          console.error('Error fetching places:', fetchError);
          return res.status(500).json({ error: fetchError.message });
        }

        if (page && page.length > 0) {
          allPlaces = allPlaces.concat(page);
          from += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Calculate distance and filter by radius
      const nearbyPlaces = allPlaces
        .map((place: any) => ({
          places_id: place.places_id,
          curio_id: place.curio_id,
          name: place.name,
          latitude: place.lat,
          longitude: place.lon,
          plus_code: place.plus_code,
        }))
        .filter((place: any) => place.latitude != null && place.longitude != null)
        .map((place: any) => {
          const distance = calculateDistance(lat, lon, place.latitude, place.longitude);
          return { ...place, distance };
        })
        .filter((place: any) => place.distance <= radius)
        .sort((a: any, b: any) => a.distance - b.distance);

      res.json({ places: nearbyPlaces });
    } catch (err) {
      console.error('Error in nearby places:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Get next curio_id
  app.get('/api/admin/places/next-curio-id', async (req, res) => {
    try {
      // Fetch ALL curio_ids by paginating through all records
      let allCurioIds: string[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error: fetchError } = await supabase
          .from('places')
          .select('curio_id')
          .not('curio_id', 'is', null)
          .range(from, from + pageSize - 1);

        if (fetchError) {
          console.error('Error fetching curio_ids:', fetchError);
          return res.status(500).json({ error: fetchError.message });
        }

        if (page && page.length > 0) {
          allCurioIds = allCurioIds.concat(page.map((p: any) => p.curio_id));
          from += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Extract numeric part from curio_id matching pattern CURIO-[0-9]+
      let maxNum = 0;
      allCurioIds.forEach((curioId: string) => {
        const match = (curioId || '').match(/^CURIO-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });

      const nextCurioId = `CURIO-${maxNum + 1}`;
      console.log(`Found ${allCurioIds.length} curio_ids, max is ${maxNum}, next is ${nextCurioId}`);
      res.json({ nextCurioId, maxNum });
    } catch (err) {
      console.error('Error getting next curio_id:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin API: Create a new place
  app.post('/api/admin/places', async (req, res) => {
    try {
      const { curio_id, name, detail_overview, latitude, longitude, plus_code } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      if (!curio_id) {
        return res.status(400).json({ error: 'curio_id is required' });
      }

      if (latitude == null || longitude == null) {
        return res.status(400).json({ error: 'latitude and longitude are required' });
      }

      // Check if curio_id already exists
      const { data: existing, error: checkError } = await supabase
        .from('places')
        .select('curio_id')
        .eq('curio_id', curio_id)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing curio_id:', checkError);
        return res.status(500).json({ error: checkError.message });
      }

      if (existing) {
        return res.status(400).json({ error: `curio_id ${curio_id} already exists` });
      }

      // Use 'lat' and 'lon' as column names based on existing schema
      const { data, error } = await supabase
        .from('places')
        .insert({
          curio_id,
          name,
          detail_overview: detail_overview || null,
          lat: latitude,
          lon: longitude,
          plus_code: plus_code || null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating place:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, place: data });
    } catch (err) {
      console.error('Error creating place:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/tours', async (req, res) => {
    try {
      const { data: tours, error: toursError } = await supabase
        .from('lists')
        .select('*')
        .eq('list_type', 'tour')
        .order('created_at', { ascending: false });

      if (toursError) {
        console.error('Error fetching tours:', toursError);
        return res.status(500).json({ error: toursError.message });
      }

      if (!tours || tours.length === 0) {
        return res.json([]);
      }

      const toursWithCounts = await Promise.all(
        tours.map(async (tour) => {
          const { data: items, error: itemsError } = await supabase
            .from('list_items')
            .select('place_id, place_uuid, order_index')
            .eq('list_uuid', tour.id)
            .order('order_index', { ascending: true });

          let itemCount = 0;
          if (!itemsError && items) {
            itemCount = items.length;
          }

          return {
            ...tour,
            item_count: itemCount,
            metadata: tour.metadata || {},
          };
        })
      );

      res.json(toursWithCounts);
    } catch (err) {
      console.error('Error fetching tours:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/tours/:tourId', async (req, res) => {
    try {
      const { tourId } = req.params;

      const { data: tour, error: tourError } = await supabase
        .from('lists')
        .select('*')
        .eq('id', tourId)
        .eq('list_type', 'tour')
        .single();

      if (tourError || !tour) {
        return res.status(404).json({ error: 'Tour not found' });
      }

      const { data: items, error: itemsError } = await supabase
        .from('list_items')
        .select('*')
        .eq('list_uuid', tourId)
        .order('order_index', { ascending: true });

      let stops: any[] = [];
      if (!itemsError && items && items.length > 0) {
        const placeIds = items.map((item: any) => item.place_id);
        const { data: places } = await supabase
          .from('places')
          .select('curio_id, name, detail_overview, lat, lon')
          .in('curio_id', placeIds)
          .eq('visible_flag', true);

        const placeMap: Record<string, any> = {};
        if (places) {
          for (const p of places) {
            placeMap[p.curio_id] = p;
          }
        }

        stops = items
          .filter((item: any) => placeMap[item.place_id])
          .map((item: any) => {
            const place = placeMap[item.place_id];
            return {
              id: item.list_item_uuid,
              list_id: item.list_uuid,
              place_id: item.place_id,
              place_name: place.name || 'Unknown Place',
              place_description: place.detail_overview || '',
              place_latitude: place.lat || 0,
              place_longitude: place.lon || 0,
              order_index: item.order_index,
              created_at: item.created_at,
            };
          });
      }

      res.json({
        tour: {
          ...tour,
          item_count: stops.length,
          metadata: tour.metadata || {},
        },
        stops,
      });
    } catch (err) {
      console.error('Error fetching tour detail:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============================================
  // Admin Tours (Lists) Management
  // ============================================

  // Serve admin tours HTML page
  app.get('/admin/tours', (_req, res) => {
    res.sendFile('admin-tours.html', { root: path.join(__dirname, '..', 'server') });
  });

  // Get all tours
  app.get('/api/admin/tours', async (_req, res) => {
    try {
      const { data: tours, error } = await supabase
        .from('lists')
        .select('*')
        .eq('list_type', 'tour')
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      const toursWithCounts = await Promise.all(
        (tours || []).map(async (tour) => {
          const { count } = await supabase
            .from('list_items')
            .select('*', { count: 'exact', head: true })
            .eq('list_uuid', tour.id);
          return { ...tour, item_count: count || 0 };
        })
      );

      res.json(toursWithCounts);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create a new tour
  app.post('/api/admin/tours', async (req, res) => {
    try {
      const { name, description, tour_length, tour_length_category, tour_start_region, tour_end_region, tour_id } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      const insert: any = {
        name: name.trim(),
        description: description || null,
        list_type: 'tour',
        user_id: 'fafec54e-cf0e-45ce-8467-7b2a50870987',
      };
      if (tour_length) insert.tour_length = tour_length;
      if (tour_length_category) insert.tour_length_category = tour_length_category;
      if (tour_start_region) insert.tour_start_region = tour_start_region;
      if (tour_end_region) insert.tour_end_region = tour_end_region;
      if (tour_id) insert.tour_id = tour_id;

      const { data, error } = await supabase
        .from('lists')
        .insert(insert)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update a tour
  app.patch('/api/admin/tours/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, tour_length, tour_length_category, tour_start_region, tour_end_region, tour_id, promoted_flag } = req.body;
      const updates: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      if (tour_length !== undefined) updates.tour_length = tour_length;
      if (tour_length_category !== undefined) updates.tour_length_category = tour_length_category;
      if (tour_start_region !== undefined) updates.tour_start_region = tour_start_region;
      if (tour_end_region !== undefined) updates.tour_end_region = tour_end_region;
      if (tour_id !== undefined) updates.tour_id = tour_id;
      if (promoted_flag !== undefined) updates.promoted_flag = promoted_flag;

      const { data, error } = await supabase
        .from('lists')
        .update(updates)
        .eq('id', id)
        .eq('list_type', 'tour')
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete a tour and its items
  app.delete('/api/admin/tours/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await supabase.from('list_items').delete().eq('list_uuid', id);

      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', id)
        .eq('list_type', 'tour');

      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get tour items
  app.get('/api/admin/tours/:id/items', async (req, res) => {
    try {
      const { id } = req.params;
      const { data: items, error } = await supabase
        .from('list_items')
        .select('*')
        .eq('list_uuid', id)
        .order('order_index', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      // Enrich with place details
      const placeIds = (items || []).map((i: any) => i.place_id).filter(Boolean);
      let placeMap: Record<string, any> = {};
      if (placeIds.length > 0) {
        const { data: places } = await supabase
          .from('places')
          .select('curio_id, name, lat, lon')
          .in('curio_id', placeIds)
          .eq('visible_flag', true);
        if (places) {
          for (const p of places) placeMap[p.curio_id] = p;
        }
      }

      const enriched = (items || [])
        .filter((item: any) => placeMap[item.place_id])
        .map((item: any) => {
          const place = placeMap[item.place_id];
          return {
            id: item.list_item_uuid || item.id,
            list_uuid: item.list_uuid,
            place_id: item.place_id,
            place_name: place.name || 'Unknown',
            place_lat: place.lat || 0,
            place_lon: place.lon || 0,
            order_index: item.order_index,
          };
        });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Add item to tour
  app.post('/api/admin/tours/:id/items', async (req, res) => {
    try {
      const { id } = req.params;
      const { place_id } = req.body;
      if (!place_id) return res.status(400).json({ error: 'place_id (curio_id) is required' });

      // Verify the place exists
      const { data: place, error: placeErr } = await supabase
        .from('places')
        .select('curio_id, name, lat, lon')
        .eq('curio_id', place_id)
        .single();

      if (placeErr || !place) return res.status(404).json({ error: 'Place not found' });

      // Get next order index
      const { count } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_uuid', id);

      const { data, error } = await supabase
        .from('list_items')
        .insert({
          list_id: id,
          list_uuid: id,
          place_id: place.curio_id,
          order_index: (count || 0) + 1,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Place already in this tour' });
        return res.status(500).json({ error: error.message });
      }

      res.json({ ...data, id: data.list_item_uuid || data.id });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Remove item from tour
  app.delete('/api/admin/tours/:id/items/:itemId', async (req, res) => {
    try {
      const { itemId } = req.params;

      const { error } = await supabase
        .from('list_items')
        .delete()
        .eq('list_item_uuid', itemId);

      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reorder tour items
  app.patch('/api/admin/tours/:id/items/reorder', async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items array is required' });

      for (const item of items) {
        await supabase
          .from('list_items')
          .update({ order_index: item.order_index })
          .eq('list_item_uuid', item.id);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Random place for admin review
  app.get('/api/admin/places/random', async (req, res) => {
    try {
      const { count, error: countError } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true });

      if (countError || !count) return res.status(500).json({ error: 'Could not count places' });

      const offset = Math.floor(Math.random() * count);
      const { data, error } = await supabase
        .from('places')
        .select('curio_id, name, lat, lon')
        .range(offset, offset)
        .limit(1);

      if (error || !data?.length) return res.status(500).json({ error: 'Could not fetch random place' });
      res.json(data[0]);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Search places for adding to tours
  app.get('/api/admin/places/search', async (req, res) => {
    try {
      const query = (req.query.q as string || '').trim();
      if (query.length < 2) return res.json([]);

      const searchTerm = `%${query}%`;
      const { data, error } = await supabase
        .from('places')
        .select('curio_id, name, lat, lon')
        .or(`name.ilike.${searchTerm},curio_id.ilike.${searchTerm}`)
        .limit(20);

      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Map explorer: Get all places with box_id computed server-side
  app.get('/api/map/places', async (req, res) => {
    try {
      const LAT_MIN = 51.28;
      const LAT_MAX = 51.70;
      const LON_MIN = -0.53;
      const LON_MAX = 0.33;
      const LAT_STEP = 0.00619;
      const LON_STEP = 0.01045;
      const NUM_COLS = Math.ceil((LON_MAX - LON_MIN) / LON_STEP); // 82

      function calcBoxId(lat: number, lon: number): number | null {
        if (lat < LAT_MIN || lat >= LAT_MAX || lon < LON_MIN || lon >= LON_MAX) return null;
        const row = Math.floor((lat - LAT_MIN) / LAT_STEP);
        const col = Math.floor((lon - LON_MIN) / LON_STEP);
        return row * NUM_COLS + col + 1;
      }

      function boxBounds(boxId: number) {
        const col = (boxId - 1) % NUM_COLS;
        const row = Math.floor((boxId - 1) / NUM_COLS);
        const latSouth = LAT_MIN + row * LAT_STEP;
        const latNorth = Math.min(latSouth + LAT_STEP, LAT_MAX);
        const lonWest = LON_MIN + col * LON_STEP;
        const lonEast = Math.min(lonWest + LON_STEP, LON_MAX);
        return { latSouth, latNorth, lonWest, lonEast };
      }

      // Fetch all places in pages of 1000 (Supabase's per-request row cap)
      let allPlaces: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('places')
          .select('curio_id, name, lat, lon, visible_flag')
          .range(from, from + pageSize - 1)
          .limit(pageSize);

        if (error) {
          console.error('Error fetching places for map:', error);
          return res.status(500).json({ error: error.message });
        }

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allPlaces = allPlaces.concat(data);
          from += pageSize;
          hasMore = data.length === pageSize;
        }
      }

      // Compute box_id for each place and group by box
      const boxMap: Record<number, { boxId: number; bounds: any; places: any[] }> = {};

      for (const place of allPlaces) {
        const lat = place.lat;
        const lon = place.lon;
        if (lat == null || lon == null) continue;

        const boxId = calcBoxId(lat, lon);
        if (boxId === null) continue;

        if (!boxMap[boxId]) {
          boxMap[boxId] = { boxId, bounds: boxBounds(boxId), places: [] };
        }

        boxMap[boxId].places.push({
          curio_id: place.curio_id,
          name: place.name,
          lat,
          lon,
          detail_overview: place.detail_overview,
          visible_flag: place.visible_flag,
        });
      }

      const boxes = Object.values(boxMap).sort((a, b) => a.boxId - b.boxId);
      res.json({ boxes, totalPlaces: allPlaces.length });
    } catch (err) {
      console.error('Error in map places endpoint:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/map/viewport', async (req, res) => {
    try {
      const latMin = parseFloat(req.query.latMin as string);
      const latMax = parseFloat(req.query.latMax as string);
      const lngMin = parseFloat(req.query.lngMin as string);
      const lngMax = parseFloat(req.query.lngMax as string);
      const lang = (req.query.lang as string) || null;

      if ([latMin, latMax, lngMin, lngMax].some(isNaN)) {
        return res.status(400).json({ error: 'latMin, latMax, lngMin, lngMax are required numeric query params' });
      }

      const SUPPORTED_LANGS = new Set(['fr','de','es','it','zh','hi','ar','ja','pt','ko']);
      const langCol = lang && SUPPORTED_LANGS.has(lang) ? `${lang}_detail_overview` : null;
      const selectCols = langCol
        ? `curio_id, name, lat, lon, detail_overview, ${langCol}, attributes`
        : 'curio_id, name, lat, lon, detail_overview, attributes';

      const { data, error } = await supabase
        .from('places')
        .select(selectCols)
        .eq('visible_flag', true)
        .gte('lat', latMin)
        .lte('lat', latMax)
        .gte('lon', lngMin)
        .lte('lon', lngMax)
        .limit(200);

      if (error) {
        console.error('Error fetching viewport places:', error);
        return res.status(500).json({ error: error.message });
      }

      const places = (data ?? []).map((place: any) => {
        const desc = (langCol && place[langCol]) ? place[langCol] : (place.detail_overview ?? '');
        return {
          id: place.curio_id,
          name: place.name ?? 'Unknown',
          description: desc,
          latitude: place.lat,
          longitude: place.lon,
          attributes: place.attributes ?? null,
        };
      }).filter((p: any) => p.latitude != null && p.longitude != null);

      res.json({ places });
    } catch (err) {
      console.error('Error in viewport endpoint:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Graph explorer: in-memory cache ──────────────────────────────────────
  const KEY_LABELS_MAP: Record<string, string> = {
    // physical
    setting: 'Setting', visibility: 'Visibility', best_experienced: 'Best experienced',
    weather_dependent: 'Weather dependent', estimated_dwell_minutes: 'Dwell time',
    // temporal
    century_tag: 'Century', primary_era: 'Primary era', secondary_eras: 'Secondary era',
    // thematic
    primary_theme: 'Primary theme', secondary_themes: 'Secondary theme', sub_themes: 'Sub-theme',
    // narrative
    mood: 'Mood', secondary_mood: 'Secondary mood', narrative_type: 'Narrative type',
    notable_person: 'Notable person',
    // walk_utility
    walk_role: 'Walk role', photo_moment: 'Photo moment', sensitivity_flag: 'Sensitivity',
    // content_utility
    depth_rating: 'Depth rating', standalone_interest: 'Standalone interest',
    tour_pack_candidates: 'Tour pack',
  };

  interface GraphAttrNode  { id: string; type: string; label: string; key: string; value: string; count: number; }
  interface GraphPlaceNode { id: string; type: 'place'; label: string; curioId: string; overview?: string; lat?: number; lon?: number; }

  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  let gAttrNodes: GraphAttrNode[]  = [];
  let gPlaceNodes: GraphPlaceNode[] = [];
  let gAllEdges:   Array<{ sourceId: string; targetId: string }> = [];
  let gAttrToPlaces = new Map<string, string[]>();
  let gPlaceToAttrs = new Map<string, string[]>();
  let gCacheReady    = false;
  let gCacheBuilding = false;

  function graphAttrId(category: string, key: string, display: string): string {
    return 'a_' + category + '_' + key + '_' + display;
  }

  function processGraphAttr(category: string, key: string, rawValue: any): string | null {
    if (rawValue === null || rawValue === undefined) return null;
    if (key === 'accessibility_notes') return null;
    let display: string;
    if (typeof rawValue === 'boolean') {
      display = rawValue ? 'Yes' : 'No';
    } else if (key === 'estimated_dwell_minutes') {
      const m = Number(rawValue);
      if (isNaN(m)) return null;
      if (m < 10) display = '<10 min';
      else if (m < 20) display = '10–20 min';
      else if (m < 40) display = '20–40 min';
      else if (m < 60) display = '40–60 min';
      else display = '60+ min';
    } else if (typeof rawValue === 'string') {
      display = rawValue.trim();
      if (!display) return null;
    } else {
      return null;
    }
    return display;
  }

  async function buildGraphCache() {
    if (gCacheBuilding || gCacheReady) return;
    gCacheBuilding = true;
    console.log('[graph] building attribute graph cache…');
    const t0 = Date.now();

    const attrNodeMap  = new Map<string, GraphAttrNode>();
    const placeNodeMap = new Map<string, GraphPlaceNode>();
    const a2p          = new Map<string, string[]>();
    const p2a          = new Map<string, string[]>();

    try {
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('places')
          .select('curio_id, name, attributes, detail_overview, lat, lon')
          .not('attributes', 'is', null)
          .range(from, from + pageSize - 1);

        if (error) throw new Error(`[graph] Supabase error: ${error.message}`);
        if (!data?.length) { hasMore = false; break; }

        const addEdge = (attrId: string, pid: string) => {
          if (!a2p.has(attrId)) a2p.set(attrId, []);
          if (!p2a.has(pid))    p2a.set(pid, []);
          a2p.get(attrId)!.push(pid);
          p2a.get(pid)!.push(attrId);
        };

        const addAttr = (pid: string, category: string, key: string, rawValue: any) => {
          const display = processGraphAttr(category, key, rawValue);
          if (!display) return;
          const attrId = graphAttrId(category, key, display);
          const label  = (KEY_LABELS_MAP[key] || key) + ': ' + display;
          if (!attrNodeMap.has(attrId)) {
            attrNodeMap.set(attrId, { id: attrId, type: category, label, key, value: display, count: 0 });
          }
          attrNodeMap.get(attrId)!.count++;
          addEdge(attrId, pid);
        };

        for (const place of data) {
          const pid = 'p_' + place.curio_id;
          placeNodeMap.set(pid, { id: pid, type: 'place', label: place.name || place.curio_id, curioId: place.curio_id, overview: place.detail_overview || '', lat: place.lat ?? undefined, lon: place.lon ?? undefined });

          const attrs = place.attributes || {};

          // physical
          const phys  = (attrs as any).physical || {};
          for (const [k, v] of Object.entries(phys)) addAttr(pid, 'physical', k, v);

          // temporal — arrays expanded per element
          const temp = (attrs as any).temporal || {};
          for (const [k, v] of Object.entries(temp)) {
            if (k === 'specific_dates') continue; // per-place unique dates, not useful for clustering
            if (Array.isArray(v)) { for (const vi of v) addAttr(pid, 'temporal', k, vi); }
            else addAttr(pid, 'temporal', k, v);
          }

          // thematic
          const them = (attrs as any).thematic || {};
          addAttr(pid, 'thematic', 'primary_theme', them.primary_theme);
          for (const v of (them.secondary_themes || [])) addAttr(pid, 'thematic', 'secondary_themes', v);
          for (const v of (them.sub_themes     || [])) addAttr(pid, 'thematic', 'sub_themes', v);

          // narrative
          const narr = (attrs as any).narrative || {};
          addAttr(pid, 'narrative', 'mood',           narr.mood);
          addAttr(pid, 'narrative', 'secondary_mood', narr.secondary_mood);
          addAttr(pid, 'narrative', 'narrative_type', narr.narrative_type);
          for (const person of (narr.notable_people || [])) {
            if (person?.name) addAttr(pid, 'narrative', 'notable_person', person.name);
          }

          // walk_utility
          const walk = (attrs as any).walk_utility || {};
          addAttr(pid, 'walk_utility', 'walk_role',        walk.walk_role);
          addAttr(pid, 'walk_utility', 'photo_moment',     walk.photo_moment);
          addAttr(pid, 'walk_utility', 'sensitivity_flag', walk.sensitivity_flag);

          // content_utility
          const cont = (attrs as any).content_utility || {};
          addAttr(pid, 'content_utility', 'depth_rating',        cont.depth_rating);
          addAttr(pid, 'content_utility', 'standalone_interest', cont.standalone_interest);
          for (const v of (cont.tour_pack_candidates || [])) addAttr(pid, 'content_utility', 'tour_pack_candidates', v);
        }

        from += pageSize;
        hasMore = data.length === pageSize;
      }

      gAttrNodes    = Array.from(attrNodeMap.values());
      gPlaceNodes   = Array.from(placeNodeMap.values());
      gAttrToPlaces = a2p;
      gPlaceToAttrs = p2a;
      // Materialise edges for the full graph payload
      const edges: Array<{ sourceId: string; targetId: string }> = [];
      for (const [attrId, placeIds] of a2p) {
        for (const placeId of placeIds) edges.push({ sourceId: attrId, targetId: placeId });
      }
      gAllEdges   = edges;
      gCacheReady = true;
      console.log(`[graph] cache ready: ${gAttrNodes.length} attr nodes, ${gPlaceNodes.length} places, ${gAllEdges.length} edges — ${Date.now() - t0}ms`);
    } catch (err) {
      console.error('[graph] buildGraphCache failed:', err);
      throw err;
    } finally {
      gCacheBuilding = false;
    }
  }

  // Kick off cache build eagerly (non-blocking)
  buildGraphCache().catch(err => console.error('[graph] cache build error:', err));

  // GET /api/admin/graph/attributes — returns complete graph: all place + attr nodes and edges.
  // Always returns 200. On ready:false the client polls. If the cache failed during startup
  // (e.g. transient Supabase error) this endpoint automatically retries the build.
  app.get('/api/admin/graph/attributes', (_req, res) => {
    if (!gCacheReady) {
      // Retry cache build if it hasn't started or previously failed
      if (!gCacheBuilding) {
        buildGraphCache().catch(err => console.error('[graph] cache retry error:', err));
      }
      return res.json({ ready: false, nodes: [], edges: [], totalPlaces: 0 });
    }
    res.json({
      ready: true,
      nodes: [...gAttrNodes, ...gPlaceNodes],
      edges: gAllEdges,
      totalPlaces: gPlaceNodes.length,
    });
  });

  // GET /api/admin/graph/search?q= — fast in-memory search across cached place nodes
  app.get('/api/admin/graph/search', (req, res) => {
    const q = ((req.query.q as string) || '').toLowerCase().trim();
    if (!gCacheReady || !q) return res.json({ results: [] });
    const results = gPlaceNodes
      .filter(p => p.label.toLowerCase().includes(q))
      .slice(0, 20);
    res.json({ results });
  });

  // GET /api/admin/graph/neighbors/:nodeId — returns neighbor nodes + edges for expand
  app.get('/api/admin/graph/neighbors/:nodeId', (req, res) => {
    const { nodeId } = req.params;
    if (!gCacheReady) return res.json({ neighbors: [], edges: [] });

    const isPlace = nodeId.startsWith('p_');
    const nbIds   = isPlace ? (gPlaceToAttrs.get(nodeId) || []) : (gAttrToPlaces.get(nodeId) || []);

    let neighbors: any[];
    if (isPlace) {
      const nbSet = new Set(nbIds);
      neighbors = gAttrNodes.filter(n => nbSet.has(n.id));
    } else {
      const nbSet = new Set(nbIds);
      neighbors = gPlaceNodes.filter(p => nbSet.has(p.id));
    }

    const edges = nbIds.map(nid => ({
      sourceId: isPlace ? nid : nodeId,
      targetId: isPlace ? nodeId : nid,
    }));

    res.json({ neighbors, edges });
  });

  // GET /api/admin/graph/curio?q=<name or curio_id>
  // Returns a single place node + its attribute nodes + edges. Used by the progressive graph.
  app.get('/api/admin/graph/curio', (req, res) => {
    const q = ((req.query.q as string) || '').trim();
    if (!q) return res.json({ found: false });
    if (!gCacheReady) return res.json({ found: false, reason: 'cache_building' });

    const ql = q.toLowerCase();
    // Exact curio_id match first, then name substring match
    let placeNode = gPlaceNodes.find(p => p.curioId.toLowerCase() === ql)
                 || gPlaceNodes.find(p => p.label.toLowerCase().includes(ql));

    if (!placeNode) return res.json({ found: false });

    const attrIds  = gPlaceToAttrs.get(placeNode.id) || [];
    const attrSet  = new Set(attrIds);
    const attrs    = gAttrNodes.filter(a => attrSet.has(a.id));
    const edges    = attrIds.map(attrId => ({ sourceId: attrId, targetId: placeNode!.id }));

    res.json({ found: true, place: placeNode, attrs, edges });
  });

  // GET /api/admin/graph/similar-nearby?attrId=<id>&lat=<lat>&lon=<lon>&excludeId=<placeNodeId>[&km=<radius>]
  // Returns place nodes within radius (default 2 km) that share the given attribute.
  app.get('/api/admin/graph/similar-nearby', (req, res) => {
    const { attrId, lat, lon, excludeId, km } = req.query as Record<string, string>;
    if (!gCacheReady || !attrId || !lat || !lon) return res.json({ places: [], edges: [] });

    const refLat    = parseFloat(lat);
    const refLon    = parseFloat(lon);
    const RADIUS_KM = Math.min(5, Math.max(0.1, parseFloat(km) || 2));

    const placeIds  = gAttrToPlaces.get(attrId) || [];
    const placeSet  = new Set(placeIds);
    const nearby    = gPlaceNodes.filter(p =>
      placeSet.has(p.id) &&
      p.id !== excludeId &&
      p.lat != null && p.lon != null &&
      haversineKm(refLat, refLon, p.lat!, p.lon!) <= RADIUS_KM
    ).map(p => ({
      ...p,
      distKm: Math.round(haversineKm(refLat, refLon, p.lat!, p.lon!) * 100) / 100,
    })).sort((a: any, b: any) => a.distKm - b.distKm);

    res.json({ places: nearby });
  });

  // GET /api/admin/graph/place-attrs?placeId=<placeNodeId>
  // Returns attribute nodes + edges for a given place node id (p_<curioId>).
  app.get('/api/admin/graph/place-attrs', (req, res) => {
    const { placeId } = req.query as Record<string, string>;
    if (!gCacheReady || !placeId) return res.json({ attrs: [], edges: [] });

    const attrIds = gPlaceToAttrs.get(placeId) || [];
    const attrSet = new Set(attrIds);
    const attrs   = gAttrNodes.filter(a => attrSet.has(a.id));
    const edges   = attrIds.map(attrId => ({ sourceId: attrId, targetId: placeId }));

    res.json({ attrs, edges });
  });

  // GET /api/admin/graph/connected?placeId=<pid>&lat=<lat>&lon=<lon>[&km=<radius>]
  // Returns all places within the given radius (default 2km) that share meaningful attributes.
  // Each connection includes the shared attribute labels for edge annotation.
  app.get('/api/admin/graph/connected', (req, res) => {
    const { placeId, lat, lon, km } = req.query as Record<string, string>;
    if (!gCacheReady || !placeId || !lat || !lon) return res.json({ connections: [] });

    const refLat = parseFloat(lat);
    const refLon = parseFloat(lon);
    const RADIUS_KM = Math.min(5, Math.max(0.1, parseFloat(km) || 2));

    // Attributes shared by more than this fraction of all places are considered trivial
    const TRIVIAL_THRESHOLD = Math.floor(gPlaceNodes.length * 0.25);

    const myAttrIds = new Set(gPlaceToAttrs.get(placeId) || []);
    if (myAttrIds.size === 0) return res.json({ connections: [] });

    // Build a fast lookup: attrId → count
    const attrCountMap = new Map<string, number>();
    for (const a of gAttrNodes) attrCountMap.set(a.id, a.count);

    const nearby = gPlaceNodes.filter(p =>
      p.id !== placeId &&
      p.lat != null && p.lon != null &&
      haversineKm(refLat, refLon, p.lat!, p.lon!) <= RADIUS_KM
    );

    const connections: Array<{
      place: GraphPlaceNode;
      sharedAttrs: Array<{ id: string; label: string; key: string; value: string }>;
      score: number;
    }> = [];

    for (const p of nearby) {
      const theirAttrIds = gPlaceToAttrs.get(p.id) || [];
      const theirSet = new Set(theirAttrIds);

      // Find non-trivial shared attributes
      const meaningful: string[] = [];
      for (const aid of myAttrIds) {
        if (!theirSet.has(aid)) continue;
        const cnt = attrCountMap.get(aid) || 0;
        if (cnt <= TRIVIAL_THRESHOLD) meaningful.push(aid);
      }

      if (meaningful.length === 0) continue;

      // Sort by rarity (most specific first) and cap at 3 labels
      meaningful.sort((a, b) => (attrCountMap.get(a) || 0) - (attrCountMap.get(b) || 0));

      const sharedAttrSet = new Set(meaningful);
      const sharedAttrs = gAttrNodes
        .filter(a => sharedAttrSet.has(a.id))
        .slice(0, 3)
        .map(a => ({ id: a.id, label: a.label, key: a.key, value: a.value }));

      connections.push({ place: p, sharedAttrs, score: meaningful.length });
    }

    // Sort by number of meaningful shared attributes, cap at 40
    connections.sort((a, b) => b.score - a.score);
    res.json({ connections: connections.slice(0, 40) });
  });

  // Map explorer: Get detail for a single place (overview + facts)
  app.get('/api/map/places/:curioId/detail', async (req, res) => {
    try {
      const { curioId } = req.params;
      const lang = typeof req.query.lang === 'string' ? req.query.lang.replace(/[^a-z]/g, '') : null;
      const SUPPORTED_LANGS = ['fr','de','es','it','zh','hi','ar','ja','pt','ko'];
      const langCol = lang && SUPPORTED_LANGS.includes(lang) ? `${lang}_detail_overview` : null;
      const selectCols = langCol
        ? `curio_id, name, detail_overview, ${langCol}, visible_flag`
        : 'curio_id, name, detail_overview, visible_flag';

      const [placeResult, factsResult] = await Promise.all([
        supabase
          .from('places')
          .select(selectCols)
          .eq('curio_id', curioId)
          .single(),
        supabase
          .from('facts')
          .select('fact_info')
          .eq('curio_id', curioId),
      ]);

      if (placeResult.error) {
        return res.status(404).json({ error: 'Place not found' });
      }

      const row = (placeResult.data || {}) as unknown as Record<string, unknown>;
      const localizedOverview = langCol ? (row[langCol] || null) : null;

      res.json({
        detail_overview: localizedOverview || row['detail_overview'] || null,
        facts: (factsResult.data || []).map((f: any) => f.fact_info).slice(0, 10),
      });
    } catch (err) {
      console.error('Error fetching place detail:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Map explorer: Get facts for a place
  app.get('/api/map/places/:curioId/facts', async (req, res) => {
    try {
      const { curioId } = req.params;
      const { data, error } = await supabase
        .from('facts')
        .select('fact_info')
        .eq('curio_id', curioId);

      if (error) {
        console.error('Error fetching facts:', error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ facts: (data || []).map((f: any) => f.fact_info).slice(0, 10) });
    } catch (err) {
      console.error('Error fetching facts:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return createServer(app);
}

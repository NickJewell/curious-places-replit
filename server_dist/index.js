// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
var supabase = createClient(supabaseUrl, supabaseServiceKey);
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
async function registerRoutes(app2) {
  app2.get("/api/admin/places/needs-overview", async (req, res) => {
    try {
      const { count } = await supabase.from("places").select("*", { count: "exact", head: true }).is("detail_overview", null);
      const { data, error } = await supabase.from("places").select("places_id, curio_id, name, plus_code, detail_overview").is("detail_overview", null);
      if (error) {
        console.error("Error fetching places:", error);
        return res.status(500).json({ error: error.message });
      }
      const sorted = (data || []).sort((a, b) => {
        const numA = parseInt((a["curio_id"] || "").replace(/\D/g, "")) || 0;
        const numB = parseInt((b["curio_id"] || "").replace(/\D/g, "")) || 0;
        return numA - numB;
      });
      const limited = sorted.slice(0, 10);
      res.json({ places: limited, total: count || 0 });
    } catch (err) {
      console.error("Error in needs-overview:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/admin/places/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { "detail_overview": detailOverview } = req.body;
      console.log("Updating place:", id, "with detail_overview:", detailOverview?.substring(0, 50));
      const { data: existing, error: fetchError } = await supabase.from("places").select("places_id, name").eq("places_id", id).single();
      if (fetchError) {
        console.error("Error fetching place:", fetchError);
        return res.status(404).json({ error: "Place not found: " + fetchError.message });
      }
      console.log("Found existing place:", existing?.name);
      const { error: updateError } = await supabase.from("places").update({ "detail_overview": detailOverview }).eq("places_id", id);
      if (updateError) {
        console.error("Error updating place:", updateError);
        return res.status(500).json({ error: updateError.message });
      }
      res.json({ success: true, place: { ...existing, "detail_overview": detailOverview } });
    } catch (err) {
      console.error("Error updating place:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/places/extract/:curioId", async (req, res) => {
    try {
      const { curioId } = req.params;
      const { data, error } = await supabase.from("places").select("*").eq("curio_id", curioId).single();
      if (error || !data) {
        return res.status(404).json({ error: `Place with curio_id "${curioId}" not found` });
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/places/lookup/:curioId", async (req, res) => {
    try {
      const { curioId } = req.params;
      const { data, error } = await supabase.from("places").select("places_id, curio_id, name, detail_overview").eq("curio_id", curioId).single();
      if (error) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json({ place: data });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/places/:curioId/audio-url", async (req, res) => {
    try {
      const { curioId } = req.params;
      const match = curioId.match(/(\d+)$/);
      if (!match) {
        return res.status(400).json({ error: "Invalid curio ID format" });
      }
      const num = parseInt(match[1], 10);
      const bucketStart = Math.floor((num - 1) / 1e3) * 1e3 + 1;
      const bucketEnd = bucketStart + 999;
      const folderStart = Math.floor((num - 1) / 100) * 100 + 1;
      const folderEnd = folderStart + 99;
      const bucket = `audio_overviews_${bucketStart}_${bucketEnd}`;
      const filePath = `${folderStart}-${folderEnd}/curio_detail_${num}.mp3`;
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
      if (error || !data?.signedUrl) {
        console.error("Error creating signed URL:", error, `bucket=${bucket} path=${filePath}`);
        return res.status(404).json({ error: "Audio not available for this place" });
      }
      res.json({ url: data.signedUrl });
    } catch (error) {
      console.error("Error generating audio URL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/places/:curioId/fact-audio/:factId", async (req, res) => {
    try {
      const { curioId, factId } = req.params;
      const match = curioId.match(/(\d+)$/);
      if (!match) {
        return res.status(400).json({ error: "Invalid curio ID format" });
      }
      const num = parseInt(match[1], 10);
      const bucketStart = Math.floor((num - 1) / 1e3) * 1e3 + 1;
      const bucketEnd = bucketStart + 999;
      const folderStart = Math.floor((num - 1) / 100) * 100 + 1;
      const folderEnd = folderStart + 99;
      const bucket = `audio_overviews_${bucketStart}_${bucketEnd}`;
      const filePath = `${folderStart}-${folderEnd}/curio_${num}_${factId}.mp3`;
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
      if (error || !data?.signedUrl) {
        console.error("Error creating fact audio signed URL:", error, `bucket=${bucket} path=${filePath}`);
        return res.status(404).json({ error: "Fact audio not available" });
      }
      res.json({ url: data.signedUrl });
    } catch (error) {
      console.error("Error generating fact audio URL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/places/:curioId/facts", async (req, res) => {
    try {
      const { curioId } = req.params;
      const { data, error } = await supabase.from("facts").select("*").eq("curio_id", curioId);
      if (error) {
        console.log("Facts table may not exist:", error.message);
        return res.json({ facts: [] });
      }
      res.json({ facts: data || [] });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/content/vote", async (req, res) => {
    try {
      const { curioId, voteType, userId } = req.body;
      if (!curioId || !voteType) {
        return res.status(400).json({ error: "curioId and voteType are required" });
      }
      const { data, error } = await supabase.from("content_votes").insert({
        curio_id: curioId,
        vote_type: voteType,
        user_id: userId || null
      }).select().single();
      if (error) {
        console.log("Vote error (table may not exist):", error.message);
        return res.status(500).json({ error: "Could not save vote. Table may not exist." });
      }
      res.json({ success: true, vote: data });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/content/vote", async (req, res) => {
    try {
      const { curioId, voteType, userId } = req.body;
      if (!curioId || !voteType) {
        return res.status(400).json({ error: "curioId and voteType are required" });
      }
      let query = supabase.from("content_votes").delete().eq("curio_id", curioId).eq("vote_type", voteType);
      if (userId) {
        query = query.eq("user_id", userId);
      } else {
        query = query.is("user_id", null);
      }
      const { error } = await query;
      if (error) {
        console.log("Vote delete error:", error.message);
        return res.status(500).json({ error: "Could not remove vote." });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/content/issue", async (req, res) => {
    try {
      const { sourceType, sourceId, issueType, otherDesc, userId } = req.body;
      if (!sourceId || !issueType) {
        return res.status(400).json({ error: "sourceId and issueType are required" });
      }
      const row = {
        source_id: sourceId,
        source_type: sourceType || "place",
        issue_type: issueType,
        user_id: userId || null
      };
      if (issueType === "other" && otherDesc) {
        row.other_desc = String(otherDesc).slice(0, 200);
      }
      const { data, error } = await supabase.from("issues").insert(row).select().single();
      if (error) {
        console.log("Issue insert error:", error.message);
        return res.status(500).json({ error: "Could not save issue." });
      }
      res.json({ success: true, issue: data });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/curio/:curioId", async (req, res) => {
    try {
      const { curioId } = req.params;
      const { data: place, error: placeError } = await supabase.from("places").select("*").eq("curio_id", curioId).single();
      if (placeError) {
        return res.status(404).json({ error: "Place not found" });
      }
      const { data: facts, error: factsError } = await supabase.from("facts").select("*").eq("curio_id", curioId);
      res.json({
        place,
        facts: factsError ? [] : facts || []
      });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/admin/facts", async (req, res) => {
    try {
      const { "curio_id": curioId, fact } = req.body;
      if (!curioId || !fact) {
        return res.status(400).json({ error: "curio_id and fact are required" });
      }
      const { data, error } = await supabase.from("facts").insert({ "curio_id": curioId, "fact_info": fact }).select().single();
      if (error) {
        console.error("Error creating fact:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, fact: data });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/admin/facts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { fact: factText } = req.body;
      if (!factText) {
        return res.status(400).json({ error: "fact is required" });
      }
      const { data: existingFact, error: fetchError } = await supabase.from("facts").select("*").eq("id", id).single();
      if (fetchError) {
        console.error("Error fetching fact:", fetchError);
        return res.status(404).json({ error: "Fact not found" });
      }
      console.log("Existing fact columns:", Object.keys(existingFact || {}));
      const columnName = Object.keys(existingFact || {}).find(
        (k) => k === "fact" || k === "content" || k === "text" || k === "fact_text" || k === "fact_info"
      ) || "fact_info";
      console.log("Using column name:", columnName);
      const updateData = {};
      updateData[columnName] = factText;
      const { error } = await supabase.from("facts").update(updateData).eq("id", id);
      if (error) {
        console.error("Error updating fact:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/admin/facts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabase.from("facts").delete().eq("id", id);
      if (error) {
        console.error("Error deleting fact:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/admin/place", async (req, res) => {
    try {
      const { lat, lon, name } = req.body;
      if (lat == null || lon == null) {
        return res.status(400).json({ error: "lat and lon are required" });
      }
      const { data: maxRows, error: maxError } = await supabase.from("places").select("curio_id").order("curio_id", { ascending: false }).limit(200);
      if (maxError) {
        console.error("Error finding max curio_id:", maxError);
        return res.status(500).json({ error: maxError.message });
      }
      let maxNum = 0;
      for (const row of maxRows || []) {
        const num = parseInt((row.curio_id || "").replace(/\D/g, "")) || 0;
        if (num > maxNum) maxNum = num;
      }
      const newCurioId = `CURIO-${maxNum + 1}`;
      const { data, error } = await supabase.from("places").insert({
        curio_id: newCurioId,
        name: name || "New Place",
        lat,
        lon
      }).select().single();
      if (error) {
        console.error("Error creating place:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, place: data, curioId: newCurioId });
    } catch (err) {
      console.error("Error creating place:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/admin/place/:curioId/name", async (req, res) => {
    try {
      const { curioId } = req.params;
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }
      const { data, error } = await supabase.from("places").update({ name }).eq("curio_id", curioId).select().single();
      if (error) {
        console.error("Error updating place name:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, place: data });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/admin/place/:curioId", async (req, res) => {
    try {
      const { curioId } = req.params;
      const { error: factsError } = await supabase.from("facts").delete().eq("curio_id", curioId);
      if (factsError) {
        console.error("Error deleting facts:", factsError);
      }
      const { error: placeError } = await supabase.from("places").delete().eq("curio_id", curioId);
      if (placeError) {
        console.error("Error deleting place:", placeError);
        return res.status(500).json({ error: placeError.message });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/places/nearby", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lon = parseFloat(req.query.lon);
      const radius = parseFloat(req.query.radius) || 250;
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "lat and lon are required" });
      }
      let allPlaces = [];
      let from = 0;
      const pageSize = 1e3;
      let hasMore = true;
      while (hasMore) {
        const { data: page, error: fetchError } = await supabase.from("places").select("places_id, curio_id, name, lat, lon, plus_code").range(from, from + pageSize - 1);
        if (fetchError) {
          console.error("Error fetching places:", fetchError);
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
      const nearbyPlaces = allPlaces.map((place) => ({
        places_id: place.places_id,
        curio_id: place.curio_id,
        name: place.name,
        latitude: place.lat,
        longitude: place.lon,
        plus_code: place.plus_code
      })).filter((place) => place.latitude != null && place.longitude != null).map((place) => {
        const distance = calculateDistance(lat, lon, place.latitude, place.longitude);
        return { ...place, distance };
      }).filter((place) => place.distance <= radius).sort((a, b) => a.distance - b.distance);
      res.json({ places: nearbyPlaces });
    } catch (err) {
      console.error("Error in nearby places:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/places/next-curio-id", async (req, res) => {
    try {
      let allCurioIds = [];
      let from = 0;
      const pageSize = 1e3;
      let hasMore = true;
      while (hasMore) {
        const { data: page, error: fetchError } = await supabase.from("places").select("curio_id").not("curio_id", "is", null).range(from, from + pageSize - 1);
        if (fetchError) {
          console.error("Error fetching curio_ids:", fetchError);
          return res.status(500).json({ error: fetchError.message });
        }
        if (page && page.length > 0) {
          allCurioIds = allCurioIds.concat(page.map((p) => p.curio_id));
          from += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      let maxNum = 0;
      allCurioIds.forEach((curioId) => {
        const match = (curioId || "").match(/^CURIO-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const nextCurioId = `CURIO-${maxNum + 1}`;
      console.log(`Found ${allCurioIds.length} curio_ids, max is ${maxNum}, next is ${nextCurioId}`);
      res.json({ nextCurioId, maxNum });
    } catch (err) {
      console.error("Error getting next curio_id:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/admin/places", async (req, res) => {
    try {
      const { curio_id, name, detail_overview, latitude, longitude, plus_code } = req.body;
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }
      if (!curio_id) {
        return res.status(400).json({ error: "curio_id is required" });
      }
      if (latitude == null || longitude == null) {
        return res.status(400).json({ error: "latitude and longitude are required" });
      }
      const { data: existing, error: checkError } = await supabase.from("places").select("curio_id").eq("curio_id", curio_id).maybeSingle();
      if (checkError) {
        console.error("Error checking existing curio_id:", checkError);
        return res.status(500).json({ error: checkError.message });
      }
      if (existing) {
        return res.status(400).json({ error: `curio_id ${curio_id} already exists` });
      }
      const { data, error } = await supabase.from("places").insert({
        curio_id,
        name,
        detail_overview: detail_overview || null,
        lat: latitude,
        lon: longitude,
        plus_code: plus_code || null
      }).select().single();
      if (error) {
        console.error("Error creating place:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, place: data });
    } catch (err) {
      console.error("Error creating place:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/tours", async (req, res) => {
    try {
      const { data: tours, error: toursError } = await supabase.from("lists").select("*").eq("list_type", "tour").order("created_at", { ascending: false });
      if (toursError) {
        console.error("Error fetching tours:", toursError);
        return res.status(500).json({ error: toursError.message });
      }
      if (!tours || tours.length === 0) {
        return res.json([]);
      }
      const toursWithCounts = await Promise.all(
        tours.map(async (tour) => {
          const { data: items, error: itemsError } = await supabase.from("list_items").select("place_id, place_uuid, order_index").eq("list_uuid", tour.id).order("order_index", { ascending: true });
          let itemCount = 0;
          if (!itemsError && items) {
            itemCount = items.length;
          }
          return {
            ...tour,
            item_count: itemCount,
            metadata: tour.metadata || {}
          };
        })
      );
      res.json(toursWithCounts);
    } catch (err) {
      console.error("Error fetching tours:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/tours/:tourId", async (req, res) => {
    try {
      const { tourId } = req.params;
      const { data: tour, error: tourError } = await supabase.from("lists").select("*").eq("id", tourId).eq("list_type", "tour").single();
      if (tourError || !tour) {
        return res.status(404).json({ error: "Tour not found" });
      }
      const { data: items, error: itemsError } = await supabase.from("list_items").select("*").eq("list_uuid", tourId).order("order_index", { ascending: true });
      let stops = [];
      if (!itemsError && items && items.length > 0) {
        const placeIds = items.map((item) => item.place_id);
        const { data: places } = await supabase.from("places").select("curio_id, name, detail_overview, lat, lon").in("curio_id", placeIds).eq("visible_flag", true);
        const placeMap = {};
        if (places) {
          for (const p of places) {
            placeMap[p.curio_id] = p;
          }
        }
        stops = items.filter((item) => placeMap[item.place_id]).map((item) => {
          const place = placeMap[item.place_id];
          return {
            id: item.list_item_uuid,
            list_id: item.list_uuid,
            place_id: item.place_id,
            place_name: place.name || "Unknown Place",
            place_description: place.detail_overview || "",
            place_latitude: place.lat || 0,
            place_longitude: place.lon || 0,
            order_index: item.order_index,
            created_at: item.created_at
          };
        });
      }
      res.json({
        tour: {
          ...tour,
          item_count: stops.length,
          metadata: tour.metadata || {}
        },
        stops
      });
    } catch (err) {
      console.error("Error fetching tour detail:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/admin/tours", (_req, res) => {
    res.sendFile("admin-tours.html", { root: path.join(__dirname, "..", "server") });
  });
  app2.get("/api/admin/tours", async (_req, res) => {
    try {
      const { data: tours, error } = await supabase.from("lists").select("*").eq("list_type", "tour").order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      const toursWithCounts = await Promise.all(
        (tours || []).map(async (tour) => {
          const { count } = await supabase.from("list_items").select("*", { count: "exact", head: true }).eq("list_uuid", tour.id);
          return { ...tour, item_count: count || 0 };
        })
      );
      res.json(toursWithCounts);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/admin/tours", async (req, res) => {
    try {
      const { name, description, tour_length, tour_length_category, tour_start_region, tour_end_region, tour_id } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const insert = {
        name: name.trim(),
        description: description || null,
        list_type: "tour",
        user_id: "fafec54e-cf0e-45ce-8467-7b2a50870987"
      };
      if (tour_length) insert.tour_length = tour_length;
      if (tour_length_category) insert.tour_length_category = tour_length_category;
      if (tour_start_region) insert.tour_start_region = tour_start_region;
      if (tour_end_region) insert.tour_end_region = tour_end_region;
      if (tour_id) insert.tour_id = tour_id;
      const { data, error } = await supabase.from("lists").insert(insert).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/admin/tours/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, tour_length, tour_length_category, tour_start_region, tour_end_region, tour_id, promoted_flag } = req.body;
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (name !== void 0) updates.name = name.trim();
      if (description !== void 0) updates.description = description;
      if (tour_length !== void 0) updates.tour_length = tour_length;
      if (tour_length_category !== void 0) updates.tour_length_category = tour_length_category;
      if (tour_start_region !== void 0) updates.tour_start_region = tour_start_region;
      if (tour_end_region !== void 0) updates.tour_end_region = tour_end_region;
      if (tour_id !== void 0) updates.tour_id = tour_id;
      if (promoted_flag !== void 0) updates.promoted_flag = promoted_flag;
      const { data, error } = await supabase.from("lists").update(updates).eq("id", id).eq("list_type", "tour").select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/admin/tours/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await supabase.from("list_items").delete().eq("list_uuid", id);
      const { error } = await supabase.from("lists").delete().eq("id", id).eq("list_type", "tour");
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/tours/:id/items", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: items, error } = await supabase.from("list_items").select("*").eq("list_uuid", id).order("order_index", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      const placeIds = (items || []).map((i) => i.place_id).filter(Boolean);
      let placeMap = {};
      if (placeIds.length > 0) {
        const { data: places } = await supabase.from("places").select("curio_id, name, lat, lon").in("curio_id", placeIds).eq("visible_flag", true);
        if (places) {
          for (const p of places) placeMap[p.curio_id] = p;
        }
      }
      const enriched = (items || []).filter((item) => placeMap[item.place_id]).map((item) => {
        const place = placeMap[item.place_id];
        return {
          id: item.list_item_uuid || item.id,
          list_uuid: item.list_uuid,
          place_id: item.place_id,
          place_name: place.name || "Unknown",
          place_lat: place.lat || 0,
          place_lon: place.lon || 0,
          order_index: item.order_index
        };
      });
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/admin/tours/:id/items", async (req, res) => {
    try {
      const { id } = req.params;
      const { place_id } = req.body;
      if (!place_id) return res.status(400).json({ error: "place_id (curio_id) is required" });
      const { data: place, error: placeErr } = await supabase.from("places").select("curio_id, name, lat, lon").eq("curio_id", place_id).single();
      if (placeErr || !place) return res.status(404).json({ error: "Place not found" });
      const { count } = await supabase.from("list_items").select("*", { count: "exact", head: true }).eq("list_uuid", id);
      const { data, error } = await supabase.from("list_items").insert({
        list_id: id,
        list_uuid: id,
        place_id: place.curio_id,
        order_index: (count || 0) + 1
      }).select().single();
      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "Place already in this tour" });
        return res.status(500).json({ error: error.message });
      }
      res.json({ ...data, id: data.list_item_uuid || data.id });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/admin/tours/:id/items/:itemId", async (req, res) => {
    try {
      const { itemId } = req.params;
      const { error } = await supabase.from("list_items").delete().eq("list_item_uuid", itemId);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.patch("/api/admin/tours/:id/items/reorder", async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) return res.status(400).json({ error: "items array is required" });
      for (const item of items) {
        await supabase.from("list_items").update({ order_index: item.order_index }).eq("list_item_uuid", item.id);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/places/random", async (req, res) => {
    try {
      const { count, error: countError } = await supabase.from("places").select("*", { count: "exact", head: true });
      if (countError || !count) return res.status(500).json({ error: "Could not count places" });
      const offset = Math.floor(Math.random() * count);
      const { data, error } = await supabase.from("places").select("curio_id, name, lat, lon").range(offset, offset).limit(1);
      if (error || !data?.length) return res.status(500).json({ error: "Could not fetch random place" });
      res.json(data[0]);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/places/search", async (req, res) => {
    try {
      const query = (req.query.q || "").trim();
      if (query.length < 2) return res.json([]);
      const searchTerm = `%${query}%`;
      const { data, error } = await supabase.from("places").select("curio_id, name, lat, lon").or(`name.ilike.${searchTerm},curio_id.ilike.${searchTerm}`).limit(20);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/map/places", async (req, res) => {
    try {
      let calcBoxId2 = function(lat, lon) {
        if (lat < LAT_MIN || lat >= LAT_MAX || lon < LON_MIN || lon >= LON_MAX) return null;
        const row = Math.floor((lat - LAT_MIN) / LAT_STEP);
        const col = Math.floor((lon - LON_MIN) / LON_STEP);
        return row * NUM_COLS + col + 1;
      }, boxBounds2 = function(boxId) {
        const col = (boxId - 1) % NUM_COLS;
        const row = Math.floor((boxId - 1) / NUM_COLS);
        const latSouth = LAT_MIN + row * LAT_STEP;
        const latNorth = Math.min(latSouth + LAT_STEP, LAT_MAX);
        const lonWest = LON_MIN + col * LON_STEP;
        const lonEast = Math.min(lonWest + LON_STEP, LON_MAX);
        return { latSouth, latNorth, lonWest, lonEast };
      };
      var calcBoxId = calcBoxId2, boxBounds = boxBounds2;
      const LAT_MIN = 51.28;
      const LAT_MAX = 51.7;
      const LON_MIN = -0.53;
      const LON_MAX = 0.33;
      const LAT_STEP = 619e-5;
      const LON_STEP = 0.01045;
      const NUM_COLS = Math.ceil((LON_MAX - LON_MIN) / LON_STEP);
      let allPlaces = [];
      let from = 0;
      const pageSize = 1e3;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.from("places").select("curio_id, name, lat, lon, visible_flag").range(from, from + pageSize - 1).limit(pageSize);
        if (error) {
          console.error("Error fetching places for map:", error);
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
      const boxMap = {};
      for (const place of allPlaces) {
        const lat = place.lat;
        const lon = place.lon;
        if (lat == null || lon == null) continue;
        const boxId = calcBoxId2(lat, lon);
        if (boxId === null) continue;
        if (!boxMap[boxId]) {
          boxMap[boxId] = { boxId, bounds: boxBounds2(boxId), places: [] };
        }
        boxMap[boxId].places.push({
          curio_id: place.curio_id,
          name: place.name,
          lat,
          lon,
          detail_overview: place.detail_overview,
          visible_flag: place.visible_flag
        });
      }
      const boxes = Object.values(boxMap).sort((a, b) => a.boxId - b.boxId);
      res.json({ boxes, totalPlaces: allPlaces.length });
    } catch (err) {
      console.error("Error in map places endpoint:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  const KEY_LABELS_MAP = {
    setting: "Setting",
    visibility: "Visibility",
    best_experienced: "Best experienced",
    weather_dependent: "Weather dependent",
    estimated_dwell_minutes: "Dwell time",
    century_tag: "Century",
    primary_era: "Primary era",
    secondary_eras: "Secondary era"
  };
  let gAttrNodes = [];
  let gPlaceNodes = [];
  let gAllEdges = [];
  let gAttrToPlaces = /* @__PURE__ */ new Map();
  let gPlaceToAttrs = /* @__PURE__ */ new Map();
  let gCacheReady = false;
  let gCacheBuilding = false;
  function graphAttrId(category, key, display) {
    return "a_" + category + "_" + key + "_" + display;
  }
  function processGraphAttr(category, key, rawValue) {
    if (rawValue === null || rawValue === void 0) return null;
    if (key === "accessibility_notes") return null;
    let display;
    if (typeof rawValue === "boolean") {
      display = rawValue ? "Yes" : "No";
    } else if (key === "estimated_dwell_minutes") {
      const m = Number(rawValue);
      if (isNaN(m)) return null;
      if (m < 10) display = "<10 min";
      else if (m < 20) display = "10\u201320 min";
      else if (m < 40) display = "20\u201340 min";
      else if (m < 60) display = "40\u201360 min";
      else display = "60+ min";
    } else if (typeof rawValue === "string") {
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
    console.log("[graph] building attribute graph cache\u2026");
    const t0 = Date.now();
    const attrNodeMap = /* @__PURE__ */ new Map();
    const placeNodeMap = /* @__PURE__ */ new Map();
    const a2p = /* @__PURE__ */ new Map();
    const p2a = /* @__PURE__ */ new Map();
    try {
      let from = 0;
      const pageSize = 1e3;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.from("places").select("curio_id, name, attributes, detail_overview").not("attributes", "is", null).range(from, from + pageSize - 1);
        if (error) throw new Error(`[graph] Supabase error: ${error.message}`);
        if (!data?.length) {
          hasMore = false;
          break;
        }
        const addEdge = (attrId, pid) => {
          if (!a2p.has(attrId)) a2p.set(attrId, []);
          if (!p2a.has(pid)) p2a.set(pid, []);
          a2p.get(attrId).push(pid);
          p2a.get(pid).push(attrId);
        };
        const addAttr = (pid, category, key, rawValue) => {
          const display = processGraphAttr(category, key, rawValue);
          if (!display) return;
          const attrId = graphAttrId(category, key, display);
          const label = (KEY_LABELS_MAP[key] || key) + ": " + display;
          if (!attrNodeMap.has(attrId)) {
            attrNodeMap.set(attrId, { id: attrId, type: category, label, key, value: display, count: 0 });
          }
          attrNodeMap.get(attrId).count++;
          addEdge(attrId, pid);
        };
        for (const place of data) {
          const pid = "p_" + place.curio_id;
          placeNodeMap.set(pid, { id: pid, type: "place", label: place.name || place.curio_id, curioId: place.curio_id, overview: place.detail_overview || "" });
          const attrs = place.attributes || {};
          const phys = attrs.physical || {};
          for (const [k, v] of Object.entries(phys)) addAttr(pid, "physical", k, v);
          const temp = attrs.temporal || {};
          for (const [k, v] of Object.entries(temp)) {
            if (Array.isArray(v)) {
              for (const vi of v) addAttr(pid, "temporal", k, vi);
            } else addAttr(pid, "temporal", k, v);
          }
        }
        from += pageSize;
        hasMore = data.length === pageSize;
      }
      gAttrNodes = Array.from(attrNodeMap.values());
      gPlaceNodes = Array.from(placeNodeMap.values());
      gAttrToPlaces = a2p;
      gPlaceToAttrs = p2a;
      const edges = [];
      for (const [attrId, placeIds] of a2p) {
        for (const placeId of placeIds) edges.push({ sourceId: attrId, targetId: placeId });
      }
      gAllEdges = edges;
      gCacheReady = true;
      console.log(`[graph] cache ready: ${gAttrNodes.length} attr nodes, ${gPlaceNodes.length} places, ${gAllEdges.length} edges \u2014 ${Date.now() - t0}ms`);
    } catch (err) {
      console.error("[graph] buildGraphCache failed:", err);
      throw err;
    } finally {
      gCacheBuilding = false;
    }
  }
  buildGraphCache().catch((err) => console.error("[graph] cache build error:", err));
  app2.get("/api/admin/graph/attributes", (_req, res) => {
    if (!gCacheReady) {
      if (!gCacheBuilding) {
        buildGraphCache().catch((err) => console.error("[graph] cache retry error:", err));
      }
      return res.json({ ready: false, nodes: [], edges: [], totalPlaces: 0 });
    }
    res.json({
      ready: true,
      nodes: [...gAttrNodes, ...gPlaceNodes],
      edges: gAllEdges,
      totalPlaces: gPlaceNodes.length
    });
  });
  app2.get("/api/admin/graph/search", (req, res) => {
    const q = (req.query.q || "").toLowerCase().trim();
    if (!gCacheReady || !q) return res.json({ results: [] });
    const results = gPlaceNodes.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 20);
    res.json({ results });
  });
  app2.get("/api/admin/graph/neighbors/:nodeId", (req, res) => {
    const { nodeId } = req.params;
    if (!gCacheReady) return res.json({ neighbors: [], edges: [] });
    const isPlace = nodeId.startsWith("p_");
    const nbIds = isPlace ? gPlaceToAttrs.get(nodeId) || [] : gAttrToPlaces.get(nodeId) || [];
    let neighbors;
    if (isPlace) {
      const nbSet = new Set(nbIds);
      neighbors = gAttrNodes.filter((n) => nbSet.has(n.id));
    } else {
      const nbSet = new Set(nbIds);
      neighbors = gPlaceNodes.filter((p) => nbSet.has(p.id));
    }
    const edges = nbIds.map((nid) => ({
      sourceId: isPlace ? nid : nodeId,
      targetId: isPlace ? nodeId : nid
    }));
    res.json({ neighbors, edges });
  });
  app2.get("/api/map/places/:curioId/detail", async (req, res) => {
    try {
      const { curioId } = req.params;
      const [placeResult, factsResult] = await Promise.all([
        supabase.from("places").select("curio_id, name, detail_overview, visible_flag").eq("curio_id", curioId).single(),
        supabase.from("facts").select("fact_info").eq("curio_id", curioId)
      ]);
      if (placeResult.error) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json({
        detail_overview: placeResult.data?.detail_overview || null,
        facts: (factsResult.data || []).map((f) => f.fact_info).slice(0, 10)
      });
    } catch (err) {
      console.error("Error fetching place detail:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/map/places/:curioId/facts", async (req, res) => {
    try {
      const { curioId } = req.params;
      const { data, error } = await supabase.from("facts").select("fact_info").eq("curio_id", curioId);
      if (error) {
        console.error("Error fetching facts:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ facts: (data || []).map((f) => f.fact_info).slice(0, 10) });
    } catch (err) {
      console.error("Error fetching facts:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  return createServer(app2);
}

// server/index.ts
import * as fs from "fs";
import * as path2 from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    origins.add("http://localhost:8081");
    origins.add("http://127.0.0.1:8081");
    const origin = req.header("origin");
    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  const adminPlacesPath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-places.html"
  );
  app2.get("/admin/places", (_req, res) => {
    res.sendFile(adminPlacesPath);
  });
  const adminCurioPath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-curio.html"
  );
  app2.get("/admin/curio", (_req, res) => {
    res.sendFile(adminCurioPath);
  });
  const adminExtractPath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-extract.html"
  );
  app2.get("/admin/extract", (_req, res) => {
    res.sendFile(adminExtractPath);
  });
  const adminMapPath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-map.html"
  );
  app2.get("/admin/map", (_req, res) => {
    res.sendFile(adminMapPath);
  });
  const adminGraphPath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-graph.html"
  );
  app2.get("/admin/graph", (_req, res) => {
    res.sendFile(adminGraphPath);
  });
  const mapExplorerPath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "map-explorer.html"
  );
  app2.get("/map", (_req, res) => {
    res.sendFile(mapExplorerPath);
  });
  app2.get("/admin/map-explorer", (_req, res) => {
    res.sendFile(mapExplorerPath);
  });
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      const manifestPath = path2.resolve(
        process.cwd(),
        "static-build",
        platform,
        "manifest.json"
      );
      if (fs.existsSync(manifestPath)) {
        return serveExpoManifest(platform, res);
      }
      return next();
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path2.resolve(process.cwd(), "assets")));
  app2.use(express.static(path2.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupMetroProxy(app2) {
  const hasStaticBuild = fs.existsSync(
    path2.resolve(process.cwd(), "static-build", "ios", "manifest.json")
  );
  if (hasStaticBuild) return;
  log("Dev mode: proxying Metro bundle requests to http://localhost:8081");
  const METRO_PATHS = [
    "/client",
    "/_expo",
    "/node_modules",
    "/manifest",
    "/symbolicate",
    "/hot",
    "/packager-status",
    "/debugger-ui",
    "/inspector",
    "/open-stack-frame",
    "/reload"
  ];
  const metroProxy = createProxyMiddleware({
    target: "http://localhost:8081",
    changeOrigin: false,
    ws: true,
    pathFilter: (pathname) => METRO_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")),
    on: {
      error: (_err, _req, res) => {
        if (res && "status" in res) {
          res.status(502).json({
            message: "Metro bundler not ready. The dev server may still be starting up."
          });
        }
      }
    }
  });
  app2.use(metroProxy);
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  setupMetroProxy(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();

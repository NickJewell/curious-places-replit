import { supabase, Curio } from './supabase';
import { getApiUrl } from './query-client';
import type { UserList, ListItem, ListWithItemCount, Tour } from '../../shared/schema';

export async function getUserLists(userId: string): Promise<ListWithItemCount[]> {
  const { data: lists, error: listsError } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', userId)
    .neq('list_type', 'tour')
    .order('created_at', { ascending: false });

  if (listsError) {
    console.error('Error fetching lists:', listsError.message);
    return [];
  }

  if (!lists || lists.length === 0) {
    return [];
  }

  const listsWithCounts = await Promise.all(
    lists.map(async (list) => {
      const { count } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);

      return {
        ...list,
        item_count: count || 0,
      } as ListWithItemCount;
    })
  );

  return listsWithCounts;
}

export async function createList(userId: string, name: string): Promise<UserList | null> {
  const { data, error } = await supabase
    .from('lists')
    .insert({
      user_id: userId,
      name: name.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating list:', error.message);
    throw new Error(error.message);
  }

  return data;
}

export async function deleteList(listId: string): Promise<boolean> {
  const { error } = await supabase
    .from('lists')
    .delete()
    .eq('id', listId);

  if (error) {
    console.error('Error deleting list:', error.message);
    return false;
  }

  return true;
}

export async function updateListName(listId: string, name: string): Promise<boolean> {
  const { error } = await supabase
    .from('lists')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', listId);

  if (error) {
    console.error('Error updating list name:', error.message);
    return false;
  }

  return true;
}

export async function getListItems(listId: string): Promise<ListItem[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('*')
    .eq('list_id', listId)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('Error fetching list items:', error.message);
    return [];
  }

  if (data && data.length > 0) {
    return data;
  }

  const { data: dataByUuid, error: uuidError } = await supabase
    .from('list_items')
    .select('*')
    .eq('list_uuid', listId)
    .order('order_index', { ascending: true });

  if (uuidError) {
    console.error('Error fetching list items by uuid:', uuidError.message);
    return [];
  }

  return dataByUuid || [];
}

export async function addPlaceToList(
  listId: string,
  place: Curio
): Promise<{ success: boolean; error?: string }> {
  const { count } = await supabase
    .from('list_items')
    .select('*', { count: 'exact', head: true })
    .eq('list_id', listId);

  const newOrderIndex = (count || 0) + 1;

  const { error } = await supabase
    .from('list_items')
    .insert({
      list_id: listId,
      place_id: place.id,
      place_name: place.name,
      place_description: place.description,
      place_latitude: place.latitude,
      place_longitude: place.longitude,
      order_index: newOrderIndex,
    });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'This place is already in the list' };
    }
    console.error('Error adding place to list:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function removePlaceFromList(itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('list_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.error('Error removing place from list:', error.message);
    return false;
  }

  return true;
}

export async function reorderListItems(
  listId: string,
  items: { id: string; order_index: number }[]
): Promise<boolean> {
  const updates = items.map((item) =>
    supabase
      .from('list_items')
      .update({ order_index: item.order_index })
      .eq('id', item.id)
      .eq('list_id', listId)
  );

  const results = await Promise.all(updates);
  const hasError = results.some((result) => result.error);

  if (hasError) {
    console.error('Error reordering list items');
    return false;
  }

  return true;
}

export async function getListById(listId: string): Promise<UserList | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('id', listId)
    .single();

  if (error) {
    console.error('Error fetching list:', error.message);
    return null;
  }

  return data;
}

export async function getOfficialTours(): Promise<Tour[]> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL('/api/tours', baseUrl);
    const res = await fetch(url, { credentials: 'include' });

    if (!res.ok) {
      console.error('Error fetching tours:', res.statusText);
      return [];
    }

    const data = await res.json();
    return data as Tour[];
  } catch (error) {
    console.error('Error fetching tours:', error);
    return [];
  }
}

export async function getTourWithStops(tourId: string): Promise<{ tour: Tour | null; stops: ListItem[] }> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL(`/api/tours/${tourId}`, baseUrl);
    const res = await fetch(url, { credentials: 'include' });

    if (!res.ok) {
      console.error('Error fetching tour:', res.statusText);
      return { tour: null, stops: [] };
    }

    const data = await res.json();
    return {
      tour: data.tour as Tour,
      stops: data.stops as ListItem[],
    };
  } catch (error) {
    console.error('Error fetching tour:', error);
    return { tour: null, stops: [] };
  }
}

export async function getTourById(tourId: string): Promise<Tour | null> {
  const { tour } = await getTourWithStops(tourId);
  return tour;
}

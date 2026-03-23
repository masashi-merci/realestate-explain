
export const onRequest: PagesFunction<{ GOOGLE_MAPS_API_KEY: string }> = async (context) => {
  const { searchParams } = new URL(context.request.url);
  const origins = searchParams.get('origins');
  const destinations = searchParams.get('destinations');
  const mode = searchParams.get('mode');
  const departure_time = searchParams.get('departure_time');
  const apiKey = context.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Google Maps API Key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins || '')}&destinations=${encodeURIComponent(destinations || '')}&mode=${mode || 'walking'}&language=ja&key=${apiKey}`;
  
  if (departure_time) {
    url += `&departure_time=${departure_time}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to calculate distance' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

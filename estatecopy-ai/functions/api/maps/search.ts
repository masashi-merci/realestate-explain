
export const onRequest: PagesFunction<{ GOOGLE_MAPS_API_KEY: string }> = async (context) => {
  const { searchParams } = new URL(context.request.url);
  const query = searchParams.get('query');
  const apiKey = context.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Google Maps API Key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query || '')}&language=ja&key=${apiKey}`
    );
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to search places' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

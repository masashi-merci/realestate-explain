
export const onRequest: PagesFunction<{ GOOGLE_MAPS_API_KEY: string }> = async (context) => {
  const { searchParams } = new URL(context.request.url);
  const location = searchParams.get('location');
  const radius = searchParams.get('radius');
  const type = searchParams.get('type');
  const rankby = searchParams.get('rankby');
  const keyword = searchParams.get('keyword');
  const apiKey = context.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Google Maps API Key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&language=ja&key=${apiKey}`;
  
  if (rankby === 'distance') {
    url += `&rankby=distance`;
  } else if (radius) {
    url += `&radius=${radius}`;
  }

  if (type) url += `&type=${type}`;
  if (keyword) url += `&keyword=${encodeURIComponent(keyword || '')}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to find nearby places' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

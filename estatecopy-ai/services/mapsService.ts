
export interface MapPlace {
  name: string;
  address: string;
  distanceText?: string;
  durationText?: string;
  category: string;
  location?: { lat: number; lng: number };
}

export const searchPlaces = async (query: string): Promise<any> => {
  const response = await fetch(`/api/maps/search?query=${encodeURIComponent(query)}`);
  return response.json();
};

export const getNearbyFacilities = async (address: string): Promise<MapPlace[]> => {
  try {
    // 1. 住所から座標を取得
    const searchData = await searchPlaces(address) as any;
    if (!searchData.results || searchData.results.length === 0) return [];
    
    const location = searchData.results[0].geometry.location;
    const locStr = `${location.lat},${location.lng}`;
    
    // 2. 周辺施設を検索
    const categories = [
      { type: 'train_station', label: '駅', rankby: 'distance', count: 3, maxDistance: 5000 },
      { keyword: '小学校', label: '学校', rankby: 'distance', count: 1, maxDistance: 2000 },
      { keyword: '中学校', label: '学校', rankby: 'distance', count: 1, maxDistance: 3000 },
      { keyword: '高校', label: '学校', rankby: 'distance', count: 1, maxDistance: 3000 },
      { keyword: '大学', label: '学校', rankby: 'distance', count: 1, maxDistance: 5000 },
      { type: 'convenience_store', label: 'コンビニ', rankby: 'distance', count: 3, maxDistance: 1500 },
      { type: 'supermarket', label: 'スーパー', rankby: 'distance', count: 3, maxDistance: 2000 },
      { type: 'post_office', label: '郵便局', rankby: 'distance', count: 2, maxDistance: 2000 },
      { type: 'hospital', label: '病院', rankby: 'distance', count: 2, maxDistance: 3000 }
    ];
    
    const allPlaces: MapPlace[] = [];
    
    for (const cat of categories) {
      let url = `/api/maps/nearby?location=${locStr}`;
      if (cat.rankby === 'distance') {
        url += `&rankby=distance`;
      } else {
        url += `&radius=2000`;
      }
      
      if (cat.type) url += `&type=${cat.type}`;
      if (cat.keyword) url += `&keyword=${encodeURIComponent(cat.keyword)}`;

      const nearbyResponse = await fetch(url);
      const nearbyData = await nearbyResponse.json() as any;
      
      if (nearbyData.results && nearbyData.results.length > 0) {
        // 駅の場合は名前に「駅」が含まれているかチェック（バス停除外の念押し）
        const filteredResults = cat.label === '駅' 
          ? nearbyData.results.filter((p: any) => p.name.includes('駅'))
          : nearbyData.results;

        const places = filteredResults.slice(0, cat.count).map((p: any) => ({
          name: p.name,
          address: p.vicinity,
          category: cat.label,
          location: p.geometry.location
        }));
        allPlaces.push(...places);
      }
    }
    
    // 3. 距離と時間を計算
    if (allPlaces.length > 0) {
      const destinations = allPlaces.map(p => `${p.location?.lat},${p.location?.lng}`).join('|');
      const distResponse = await fetch(`/api/maps/distance?origins=${locStr}&destinations=${encodeURIComponent(destinations)}&mode=walking`);
      const distData = await distResponse.json() as any;
      
      if (distData.rows && distData.rows[0].elements) {
        const finalPlaces: MapPlace[] = [];
        distData.rows[0].elements.forEach((el: any, idx: number) => {
          if (el.status === 'OK') {
            const distanceValue = el.distance.value; // meters
            const category = allPlaces[idx].category;
            const maxDist = categories.find(c => c.label === category)?.maxDistance || 5000;

            // 距離制限内のみ採用
            if (distanceValue <= maxDist) {
              allPlaces[idx].distanceText = el.distance.text;
              allPlaces[idx].durationText = el.duration.text;
              finalPlaces.push(allPlaces[idx]);
            }
          }
        });
        return finalPlaces;
      }
    }
    
    return allPlaces;
  } catch (error) {
    console.error('Failed to fetch nearby facilities:', error);
    return [];
  }
};

export const getAccessTimes = async (address: string): Promise<MapPlace[]> => {
  try {
    const searchData = await searchPlaces(address) as any;
    if (!searchData.results || searchData.results.length === 0) return [];
    const locStr = `${searchData.results[0].geometry.location.lat},${searchData.results[0].geometry.location.lng}`;

    const majorStations = ['東京駅', '新宿駅', '池袋駅', '渋谷駅'];
    const results: MapPlace[] = [];

    // 現在時刻を指定して検索（transitモードでは推奨）
    const now = Math.floor(Date.now() / 1000);
    const distResponse = await fetch(`/api/maps/distance?origins=${locStr}&destinations=${encodeURIComponent(majorStations.join('|'))}&mode=transit&departure_time=${now}`);
    const distData = await distResponse.json() as any;

    if (distData.rows && distData.rows[0].elements) {
      distData.rows[0].elements.forEach((el: any, idx: number) => {
        let duration = '不明';
        if (el.status === 'OK') {
          duration = el.duration.text;
        } else {
          console.warn(`Distance Matrix failed for ${majorStations[idx]}: ${el.status}`);
        }
        
        results.push({
          name: majorStations[idx],
          address: '',
          category: 'アクセス',
          durationText: duration
        });
      });
    }
    
    // 全て不明な場合は、徒歩モードで再試行（駅までの距離の目安として）
    if (results.every(r => r.durationText === '不明')) {
      console.log('Transit mode failed for all stations. Retrying with walking mode as fallback.');
      const walkResponse = await fetch(`/api/maps/distance?origins=${locStr}&destinations=${encodeURIComponent(majorStations.join('|'))}&mode=walking`);
      const walkData = await walkResponse.json() as any;
      if (walkData.rows && walkData.rows[0].elements) {
        walkData.rows[0].elements.forEach((el: any, idx: number) => {
          if (el.status === 'OK') {
            results[idx].durationText = `(徒歩)${el.duration.text}`;
          }
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Failed to fetch access times:', error);
    return [];
  }
};

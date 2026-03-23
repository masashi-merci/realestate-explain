
import { GoogleGenAI, Part, ThinkingLevel } from "@google/genai";
import { FLATTENED_FORBIDDEN_WORDS } from "../constants";
import { getNearbyFacilities } from "./mapsService";

const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

// APIキー取得ロジックの強化（Vite/Vercel両対応）
const getApiKey = () => {
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  // @ts-ignore - Vite environment variables
  const viteApiKey = import.meta.env?.VITE_API_KEY || import.meta.env?.API_KEY;
  if (viteApiKey) return viteApiKey;
  
  // Fallback to window global if injected
  return (window as any).__ENV_API_KEY__;
};

const simulateStream = async (onChunk: (text: string) => void) => {
  const demoText = `【キャッチコピー案】
1. 横浜・関内エリアの利便性を享受する、都市型レジデンスの真価。
2. 2路線利用可能。歴史と先進が交差する「石川町」で描く、上質な日常。
3. 公園と利便施設が寄り添う住環境。ブリシア横濱石川町、誕生。

【物件紹介文】
神奈川県横浜市中区長者町に位置する「ブリシア横濱石川町」は、利便性と居住性を兼ね備えた、鉄筋コンクリート造のマンションです。
交通アクセスは、JR京浜東北・根岸線「石川町」駅まで徒歩8分、横浜市営地下鉄ブルーライン「伊勢佐木長者町」駅まで徒歩7分と、2路線が利用可能。横浜エリアはもちろん、都心方面へのアクセスもスムーズです。

周辺環境の充実も本物件の大きな魅力です。徒歩圏内には「まいばすけっと」や「ローソン」などの買い物施設が点在し、日々の生活をサポートします。また、横浜スタジアムを擁する「横浜公園」や、遊具のある「扇町公園」も近く、都市機能の中にありながら緑を感じられる環境が整っています。
教育機関や医療施設も充実しており、単身者からファミリーまで、幅広い層にとって暮らしやすい住環境が提供されています。歴史ある横浜の街並みと調和する、洗練された外観デザインも特徴の一つです。`;
  
  const chunks = demoText.split("");
  let current = "";
  for (const char of chunks) {
    current += char;
    onChunk(current);
    await new Promise(r => setTimeout(r, 5));
  }
  return demoText;
};

export const generatePropertyDescriptionStream = async (
  propertyName: string,
  address: string,
  pdfFile: File | null,
  referenceUrl: string,
  referenceText: string | undefined,
  useSearch: boolean,
  onChunk: (text: string) => void,
  buildingAge?: string,
  totalUnits?: string,
  floorPlanText?: string,
  floorPlanImage?: File | null,
  propertyType?: 'mansion' | 'house' | 'other'
): Promise<{ fullText: string; groundingUrls: string[]; facilities: any[] }> => {
  
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.warn("APIキー未設定のためデモモードで動作します。Vercel等の管理画面で API_KEY を設定してください。");
    const fullText = await simulateStream(onChunk);
    return { fullText, groundingUrls: [], facilities: [] };
  }

  // 1. Google Maps APIを使用して正確な周辺情報を取得
  let nearbyFacilities: any[] = [];
  try {
    nearbyFacilities = await getNearbyFacilities(address);
  } catch (error) {
    console.error("Failed to fetch nearby facilities from Maps API:", error);
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const parts: Part[] = [];

  if (pdfFile) {
    parts.push({ inlineData: { mimeType: 'application/pdf', data: await convertFileToBase64(pdfFile) } });
  }
  if (floorPlanImage) {
    parts.push({ inlineData: { mimeType: floorPlanImage.type, data: await convertFileToBase64(floorPlanImage) } });
  }

  const systemInstruction = `
あなたはプロの不動産コピーライターです。
不動産公正競争規約（公取規約）を遵守し、正確かつ魅力的な物件紹介文を作成してください。

【執筆のルール】
1. **正確性の徹底**: 提供されたデータ（所在地、築年数、総戸数、周辺施設など）に忠実に記述してください。推測で情報を捏造しないでください。特に「駅」については、提供されたデータに駅がない場合や、明らかに遠い場合は「最寄り駅なし」またはバス利用の旨を記載してください。
2. **公取規約の遵守**: 「最高」「格安」「日本一」などの不当表示は避け、客観的な事実に基づいた表現を使用してください。
3. **街の魅力の描写**: 単なる施設の羅列ではなく、その街の雰囲気、歴史、利便性、住み心地など「街の魅力」を具体的に盛り込んでください。
4. **周辺施設と距離**: ユーザーから提供される「周辺施設データ」を基に、主要な施設を文章の中に自然な形で組み込んでください。施設名と道のり距離（m）は正確に記載してください。バス停を「駅」と誤認して記載しないでください。
5. **物件種別による制限**: 
   - マンションの場合：築年数と総戸数を必ず文中に含めてください。
   - 戸建ての場合：築年数と総戸数は記載しないでください。

【出力形式】
必ず以下の見出しを付けてください。
---
【キャッチコピー案】
1. [物件の最大の特徴を捉えた案]
2. [利便性や周辺環境を強調した案]
3. [ターゲット層に響くライフスタイル提案型の案]

【物件紹介文】
[物件名]は、[所在地]に位置する[物件種別]です。
(続けて、街の魅力、アクセス、周辺環境、建物の特徴などを400文字〜500文字程度で記述。主要な施設は距離も明記)

[FACILITIES_JSON]
[
  {"name": "施設名", "distance": "〇〇m", "category": "駅"},
  ...
]
[/FACILITIES_JSON]
---
`;

  const userPrompt = `
物件名: ${propertyName}
所在地: ${address}
物件種別: ${propertyType === 'house' ? '戸建て' : propertyType === 'mansion' ? 'マンション' : 'その他'}
築年数: ${buildingAge || '未入力'}
総戸数: ${totalUnits || '未入力'}
間取り情報: ${floorPlanText || '画像参照'}
${referenceText ? `参考情報: ${referenceText}\n` : ''}

${nearbyFacilities.length > 0 
  ? `【周辺施設データ（正確な距離）】\n${nearbyFacilities.map(f => `- ${f.category}: ${f.name} (徒歩${f.distanceText || '不明'})`).join('\n')}`
  : '周辺施設データがありません。'}

指示:
1. 上記データを基に、正確で信頼性の高い紹介文を作成してください。
2. **重要**: 単なる施設の羅列ではなく、その街がどのような場所か（落ち着いた住宅街、活気ある商業エリアなど）といった「街の説明」を充実させてください。
3. マンションの場合は築年数と総戸数を必ず記載してください。データが「未入力」の場合は、捏造せず「調査中」とするか、Google検索で確実な情報が得られた場合のみ記載してください。
4. 戸建ての場合は築年数と総戸数は記載しないでください。
5. 特定した周辺施設は、主要なものを文章の中に自然に組み込み、最後に [FACILITIES_JSON] 内にすべてリストアップしてください。
`;

  try {
    parts.push({ text: userPrompt });

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: parts }],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        tools: [
          { googleSearch: {} }
        ]
      }
    });

    let fullText = "";
    let groundingUrls: string[] = [];

    for await (const chunk of responseStream) {
      const textChunk = chunk.text;
      if (textChunk) {
        fullText += textChunk;
        // JSONタグが含まれている場合は、表示用のテキストから除外してストリームに流す
        const displayPath = fullText.split('[FACILITIES_JSON]')[0];
        onChunk(displayPath);
      }
      const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        chunks.forEach(c => { if (c.web?.uri) groundingUrls.push(c.web.uri); });
      }
    }

    // 施設リストの抽出
    let facilities: any[] = [];
    const jsonMatch = fullText.match(/\[FACILITIES_JSON\]([\s\S]*?)\[\/FACILITIES_JSON\]/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        facilities = JSON.parse(jsonMatch[1].trim());
      } catch (e) {
        console.error("Failed to parse facilities JSON:", e);
      }
    }

    // 表示用テキストからJSONタグを削除
    const finalDisplayText = fullText.replace(/\[FACILITIES_JSON\][\s\S]*?\[\/FACILITIES_JSON\]/, '').trim();

    return { 
      fullText: finalDisplayText, 
      groundingUrls: [...new Set(groundingUrls)],
      facilities
    };

  } catch (error: any) {
    console.error("Gemini Error:", error);
    return { fullText: await simulateStream(onChunk), groundingUrls: [], facilities: [] };
  }
};

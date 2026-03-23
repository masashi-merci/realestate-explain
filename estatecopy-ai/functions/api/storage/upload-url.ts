
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const onRequest: PagesFunction<{
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_DOMAIN: string;
}> = async (context) => {
  const { searchParams } = new URL(context.request.url);
  const fileName = searchParams.get('fileName');
  const contentType = searchParams.get('contentType');

  if (!fileName || !contentType) {
    return new Response(JSON.stringify({ error: 'Missing fileName or contentType' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_PUBLIC_DOMAIN,
  } = context.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return new Response(JSON.stringify({ error: 'R2 Configuration missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const key = `uploads/${Date.now()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
    const publicUrl = `${R2_PUBLIC_DOMAIN}/${key}`;

    return new Response(JSON.stringify({ uploadUrl: url, publicUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('R2 Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate upload URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

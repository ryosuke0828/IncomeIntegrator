const { google } = require('googleapis');
const AWS = require('aws-sdk');

const secretsManager = new AWS.SecretsManager({
  region: 'region-hogehoge', // 使用するリージョンを指定
});

module.exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod === "GET") {
    try {
      const { start, end } = event.queryStringParameters;

      if (!start || !end) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "start および end パラメータが必要です" }),
        };
      }

      // 認証情報とトークンを Secrets Manager から取得
      const credentialsRaw = await secretsManager.getSecretValue({
        SecretId: 'credentials-id' // 認証情報の取得
      }).promise();

      const tokenRaw = await secretsManager.getSecretValue({
        SecretId: 'token-id' // トークンの取得
      }).promise();

      const credentials = JSON.parse(credentialsRaw.SecretString);
      const token = JSON.parse(tokenRaw.SecretString);
      const { client_id, client_secret, redirect_uris } = credentials.web;

      const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
      oAuth2Client.setCredentials(token);

      // リフレッシュトークンを使い場合の処理
      if (
        oAuth2Client.credentials.expiry_date &&
        oAuth2Client.credentials.expiry_date < Date.now()
      ) {
        console.log("🔁 Token expired. Refreshing...");

        const { credentials: newCreds } = await oAuth2Client.refreshAccessTokenAsync();

        await secretsManager.putSecretValue({
          SecretId: 'token-id',
          SecretString: JSON.stringify(newCreds),
        }).promise();
      }

      // Google Calendar API で予定取得
      const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date(start).toISOString(), // フロントエンドから渡された開始日
        timeMax: new Date(end).toISOString(),   // フロントエンドから渡された終了日
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100, // 最大で取得できるイベント数
      });

      const events = res.data.items
        ?.filter(event => event.colorId === '11') // ★★★ colorIdが'11'のイベントのみフィルタリング(Tomatoに対応) ★★★
        .map((event) => ({
          title: event.summary || "No Title",
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          colorId: event.colorId
        }))
        || [];


      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(events),
      };

    } catch (err) {
      console.error("Error fetching google calendat informatiopn:", err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Error fetching google calendar information", detail: err.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: "Method Not Allowed" }),
  };
};
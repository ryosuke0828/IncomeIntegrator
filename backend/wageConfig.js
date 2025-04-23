const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

TABLE_NAME = 'hogehoge' //使用するテーブル名を指定


const dynamoDb = new AWS.DynamoDB.DocumentClient({
  region: 'region-hogehoge', //使用するリージョンを指定
});

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight check successful' }),
    };
  }

  // GET リクエストの処理
  if (event.httpMethod === 'GET') {
    try {
      // DynamoDB から全設定を取得
      const params = { TableName: TABLE_NAME };
      const result = await dynamoDb.scan(params).promise();
      const configs = result.Items || [];

      console.log(`[wageConfigHandler:GET] Successfully fetched ${configs.length} configs.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(configs),
      };
    } catch (error) {
      console.error("[wageConfigHandler:GET] Error fetching wage configs from DynamoDB:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: errorMessage, error: error.message, code: error.code }),
      };
    }
  }

  // POST リクエストの処理 (新規追加/更新/削除)
  if (event.httpMethod === 'POST') {
    let requestBody;
    try {

      requestBody = JSON.parse(event.body || '{}');

      // 削除リクエストかどうかの判定
      if (requestBody.action === 'deleteConfig' && requestBody.id) {
        // --- 削除処理 ---
        const { id } = requestBody;

        // DynamoDB から指定された ID の項目を削除
        const params = {
          TableName: TABLE_NAME,
          Key: { id: id },
        };
        await dynamoDb.delete(params).promise();

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ message: `Wage config with id ${id} deleted successfully` }),
        };

      } else {
        // --- 新規追加/更新処理 ---
        // フロントエンドから送られてくるデータ構造を想定
        const { day: days, jobName, startTime, endTime, wage, transport, allowance } = requestBody;

        // バリデーション
        if (!Array.isArray(days) || days.length === 0 || !startTime || !endTime || wage === undefined || wage === null) {
           console.error("[wageConfigHandler:POST] Validation failed: Missing required fields. Received:", requestBody);
           return {
             statusCode: 400,
             headers,
             body: JSON.stringify({ message: "Missing required fields (days, startTime, endTime, wage)" }),
           };
        }


        // 各曜日について DynamoDB に項目を追加/更新
        const promises = days.map(async (day) => {
          const newItem = {
            id: uuidv4(),
            day,
            jobName: jobName,
            startTime,
            endTime,
            wage: Number(wage),
            transport: Number(transport || 0),
            allowance: Number(allowance || 0),
            createdAt: new Date().toISOString(),
          };
          const params = {
            TableName: TABLE_NAME,
            Item: newItem,
          };
          await dynamoDb.put(params).promise();
          return newItem; // 保存したアイテムを返す
        });
        const savedItems = await Promise.all(promises);

        console.log(`[wageConfigHandler:POST] Successfully saved ${savedItems.length} wage config(s).`);
        return {
          statusCode: 201, // 新規作成成功
          headers,
          body: JSON.stringify({ message: "Wage config(s) saved successfully", data: savedItems }), // 保存したデータを返す
        };
      }
    } catch (error) {
      // ★ POST処理中のエラーログを詳細化
      console.error("[wageConfigHandler:POST] Error processing POST request:", error);
      // JSON パースエラーなどもここでキャッチされる可能性がある
      if (error instanceof SyntaxError) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Invalid JSON format in request body" }),
        };
      }
      let errorMessage = "Failed to process request.";
      return {
        statusCode: 500,
        headers,
        // ★ エラーメッセージを修正
        body: JSON.stringify({ message: errorMessage, error: error.message, code: error.code }),
      };
    }
  }

  // サポートされていない HTTP メソッドによるリクエストを処理
  console.log(`Unsupported HTTP method: ${event.httpMethod}`);
  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ message: `HTTP method ${event.httpMethod} is not supported by this endpoint` }),
  };
};
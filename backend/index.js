const AWS = require('aws-sdk');
const { handler: calendarHandler } = require('./calendar');
const { handler: wageConfigHandler } = require('./wageConfig.js');

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));


  let action;
  let handlerToCall;
  const httpMethod = event.httpMethod;

  try {
    // アクションを特定
    if (httpMethod === 'GET' && event.queryStringParameters) {
      action = event.queryStringParameters.action;
      console.log(`[Lambda Handler] GET action: ${action}`);
    } else if (httpMethod === 'POST' && event.body) {
      try {
        const body = JSON.parse(event.body);
        action = body.action;
        console.log(`[Lambda Handler] POST action: ${action}`);
      } catch (parseError) {
        console.error('[Lambda Handler] Error parsing POST body:', parseError);
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: 'Bad Request', message: 'Invalid JSON body.' }),
        };
      }
    } else {
        // GET/POST 以外、または action を特定できない場合
        console.log('[Lambda Handler] Unsupported method or missing action information.');
        // API Gateway経由でない場合やヘルスチェックなどの可能性も考慮
        // 必要であればデフォルトの応答やエラーを返す
         return {
             statusCode: 200, // または 400 Bad Request
             headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
             body: JSON.stringify({ message: 'Handler invoked. Specify action via GET query or POST body.' }),
         };
    }

    // アクションに基づいてハンドラーを選択
    switch (action) {
      case 'getEvents':
        if (httpMethod === 'GET') {
          handlerToCall = calendarHandler;
        }
        break;
      case 'getConfigs':
        if (httpMethod === 'GET') {
          handlerToCall = wageConfigHandler;
        }
        break;
      case 'saveConfig':
        if (httpMethod === 'POST') {
          handlerToCall = wageConfigHandler;
        }
        break;
      case 'deleteConfig':
         if (httpMethod === 'POST') {
           handlerToCall = wageConfigHandler;
         }
         break;
      default:
        console.log(`[Lambda Handler] Unknown or unsupported action: ${action} for method ${httpMethod}`);
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: 'Bad Request', message: `Unknown or unsupported action: ${action}` }),
        };
    }

    if (!handlerToCall) {
        console.log(`[Lambda Handler] No handler found for action: ${action} and method: ${httpMethod}`);
         return {
             statusCode: 405,
             headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
             body: JSON.stringify({ error: 'Method Not Allowed', message: `Action ${action} does not support method ${httpMethod}.` }),
         };
    }

    // 選択したハンドラーを実行
    const result = await handlerToCall(event);

    const headers = {
        ...result.headers,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    return {
        ...result,
        headers: headers
    };

  } catch (error) {
    console.error(`[Lambda Handler] Error processing action ${action}:`, error);
    return {
      statusCode: 500,
      headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message || 'An unexpected error occurred.' }),
    };
  }
};

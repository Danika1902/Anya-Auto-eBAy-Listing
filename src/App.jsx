{
  "name": "eBay Listing Status Tracker API",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "ebay-listing-status",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "a1b2c3d4-1111-4444-aaaa-000000000001",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 300],
      "webhookId": "ebay-listing-status"
    },
    {
      "parameters": {
        "jsCode": "const staticData = $getWorkflowStaticData('global');\n\nif (!staticData.listings) {\n  staticData.listings = {};\n}\n\nconst body = $json.body || {};\nconst action = body.action || 'read';\n\nif (action === 'update') {\n  const { id, status, title, progress, step_label } = body;\n  \n  if (!id) {\n    return [{ json: { success: false, error: 'Missing listing id' } }];\n  }\n  \n  const existing = staticData.listings[id] || {};\n  \n  staticData.listings[id] = {\n    id,\n    status: status || existing.status || 'submitted',\n    title: title || existing.title || '',\n    progress: progress !== undefined ? progress : (existing.progress || 0),\n    step_label: step_label || existing.step_label || '',\n    updatedAt: new Date().toISOString(),\n    createdAt: existing.createdAt || new Date().toISOString()\n  };\n  \n  return [{ json: { success: true, listing: staticData.listings[id] } }];\n  \n} else if (action === 'delete') {\n  const { id } = body;\n  if (id && staticData.listings[id]) {\n    delete staticData.listings[id];\n  }\n  return [{ json: { success: true } }];\n  \n} else if (action === 'clear') {\n  staticData.listings = {};\n  return [{ json: { success: true } }];\n  \n} else {\n  // action === 'read'\n  const listings = Object.values(staticData.listings)\n    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));\n  return [{ json: { listings } }];\n}\n"
      },
      "id": "a1b2c3d4-2222-4444-aaaa-000000000002",
      "name": "Handle Request",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [480, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": {
          "responseHeaders": {
            "entries": [
              {
                "name": "Access-Control-Allow-Origin",
                "value": "*"
              },
              {
                "name": "Access-Control-Allow-Methods",
                "value": "POST, OPTIONS"
              },
              {
                "name": "Access-Control-Allow-Headers",
                "value": "Content-Type"
              }
            ]
          }
        }
      },
      "id": "a1b2c3d4-3333-4444-aaaa-000000000003",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [720, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Handle Request",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Handle Request": {
      "main": [
        [
          {
            "node": "Respond",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": true,
  "settings": {
    "executionOrder": "v1"
  },
  "tags": [],
  "pinData": {}
}

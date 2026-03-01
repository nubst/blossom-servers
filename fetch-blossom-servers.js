// Node.js script to list Blossom servers from Nostr
// Queries kind:36363 events to discover published Blossom servers

const fs = require('fs');
const WebSocket = require('ws');

async function fetchBlossomServers() {
  // Core relays - always include these
  const coreRelays = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://relay.primal.net'
  ];

  let allRelays = [...coreRelays];
  
  // Fetch additional relays from nostr.watch API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch('https://api.nostr.watch/v1/online', {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const onlineRelays = await response.json();
      
      // Filter and deduplicate
      const additionalRelays = onlineRelays
        .filter(relay => typeof relay === 'string' && relay.startsWith('wss://'))
        .filter(relay => !coreRelays.includes(relay));
      
      // Randomly select additional relays
      const maxAdditional = 16;
      const shuffled = additionalRelays.sort(() => Math.random() - 0.5);
      const selectedRelays = shuffled.slice(0, maxAdditional);
      
      allRelays = [...coreRelays, ...selectedRelays];
    }
  } catch (error) {
    console.error('Failed to fetch relays from nostr.watch:', error.message);
    // Continue with just core relays if API fails
  }

  const servers = new Map(); // Use Map to deduplicate by URL, keeping newest
  const timeout = 5000; // 5 second timeout per relay
  
  // Query relays with concurrency limit
  const results = [];
  const concurrency = 6;
  
  for (let i = 0; i < allRelays.length; i += concurrency) {
    const batch = allRelays.slice(i, i + concurrency);
    const batchPromises = batch.map(relay => 
      queryRelay(relay, timeout)
        .catch(err => {
          console.error(`Error querying ${relay}:`, err.message);
          return [];
        })
    );
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  // Merge results from all relays, keeping the newest announcement per URL
  for (const relayServers of results) {
    for (const server of relayServers) {
      const existing = servers.get(server.url);
      // Keep this server if: no existing entry OR this one is newer
      if (!existing || server.created_at > existing.created_at) {
        servers.set(server.url, server);
      }
    }
  }

  // Sort by created_at descending (newest first) and extract just URLs
  const sortedServers = Array.from(servers.values())
    .sort((a, b) => b.created_at - a.created_at)
    .map(s => s.url);

  return {
    servers: sortedServers,
    relaysSearched: allRelays.length
  };
}

async function queryRelay(relayUrl, timeout) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    const servers = [];
    let timeoutId;

    // Subscription ID
    const subId = 'blossom-' + Math.random().toString(36).substr(2, 9);

    // Timeout handler
    timeoutId = setTimeout(() => {
      ws.close();
      resolve(servers);
    }, timeout);

    ws.on('open', () => {
      // Send subscription request for kind:36363 (Blossom servers)
      const subscription = JSON.stringify([
        'REQ',
        subId,
        {
          kinds: [36363],
          limit: 500  // Increased limit to capture more historical servers
        }
      ]);
      ws.send(subscription);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle EVENT messages
        if (message[0] === 'EVENT' && message[1] === subId) {
          const nostrEvent = message[2];
          const server = parseBlossomServer(nostrEvent);
          if (server) {
            servers.push(server);
          }
        }
        
        // Handle EOSE (End of Stored Events)
        if (message[0] === 'EOSE' && message[1] === subId) {
          clearTimeout(timeoutId);
          ws.close();
          resolve(servers);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`WebSocket error: ${err.message}`));
    });

    ws.on('close', () => {
      clearTimeout(timeoutId);
      resolve(servers);
    });
  });
}

function parseBlossomServer(event) {
  try {
    // Extract the "d" tag which contains the server URL
    const dTag = event.tags.find(tag => tag[0] === 'd');
    if (!dTag || !dTag[1]) return null;

    const serverUrl = dTag[1];
    
    // Only include URLs that start with https://
    if (!serverUrl.startsWith('https://')) return null;
    
    // Extract optional metadata
    const nameTag = event.tags.find(tag => tag[0] === 'name');
    const descTag = event.tags.find(tag => tag[0] === 'description');
    
    return {
      url: serverUrl,
      name: nameTag ? nameTag[1] : null,
      description: descTag ? descTag[1] : null,
      pubkey: event.pubkey,
      created_at: event.created_at,
      event_id: event.id
    };
  } catch (err) {
    console.error('Error parsing server event:', err);
    return null;
  }
}

// Main execution
(async () => {
  try {
    console.log('Fetching Blossom servers from Nostr relays...');
    const result = await fetchBlossomServers();
    
    const output = {
      success: true,
      count: result.servers.length,
      relays_searched: result.relaysSearched,
      servers: result.servers,
      timestamp: new Date().toISOString()
    };
    
    // Write to BlossomListOutput.json
    fs.writeFileSync('BlossomListOutput.json', JSON.stringify(output, null, 2));
    
    console.log(`✓ Successfully fetched ${result.servers.length} Blossom servers`);
    console.log(`✓ Searched ${result.relaysSearched} relays`);
    console.log(`✓ Saved to BlossomListOutput.json`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();

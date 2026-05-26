const fetch = global.fetch || require('node-fetch');

const BASE = 'http://127.0.0.1:8180/v1/projects/evotepro-7deff/databases/(default)/documents';
const FUNC = 'http://127.0.0.1:5101/evotepro-7deff/us-central1/castPublicVoteSecure';

async function createDoc(path, docId, body) {
  const url = `${BASE}/${path}${docId ? `?documentId=${docId}` : ''}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(`CREATE ${path}/${docId} -> ${res.status}`);
  try { console.log(JSON.parse(text)); } catch (e) { console.log(text); }
}

async function getDoc(path) {
  const url = `${BASE}/${path}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log(`GET ${path} -> ${res.status}`);
  try { console.log(JSON.parse(text)); } catch (e) { console.log(text); }
}

(async () => {
  try {
    await createDoc('users/creator1/elections', 'elect1', {
      fields: {
        title: { stringValue: 'Test Election' },
        isActive: { booleanValue: true },
        verification: { mapValue: { fields: { method: { stringValue: 'CNIC' } } } },
      }
    });

    await createDoc('users/creator1/elections/elect1/candidates', '1', {
      fields: {
        name: { stringValue: 'Alice' },
        votes: { integerValue: '0' }
      }
    });

    await createDoc('publicElections', 'PUBLIC123', {
      fields: {
        creatorId: { stringValue: 'creator1' },
        electionId: { stringValue: 'elect1' },
        isActive: { booleanValue: true }
      }
    });

    console.log('\nCalling function castPublicVoteSecure...');
    const fnRes = await fetch(FUNC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { publicCode: 'PUBLIC123', candidateId: 1, voter: { name: 'Bob', identifier: '12345-1234567-1', age: 30 } } })
    });
    const fnText = await fnRes.text();
    console.log('Function response status:', fnRes.status);
    try { console.log(JSON.parse(fnText)); } catch (e) { console.log(fnText); }

    console.log('\nFetching candidate document to verify votes...');
    await getDoc('users/creator1/elections/elect1/candidates/1');

  } catch (err) {
    console.error('Error during smoke test:', err);
    process.exitCode = 1;
  }
})();

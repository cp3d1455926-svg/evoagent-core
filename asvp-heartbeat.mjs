const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJleGFtSWQiOiJleGFtLTExM2Q1ZWI5IiwicmVwb3J0SWQiOiJldmFsLTExM2Q1ZWI5IiwiYWdlbnROYW1lIjoi5bCP6ay8IiwiZW1haWwiOiJjcDNkMTQ1NTkyNkBwZXRhbG1haWwuY29tIiwiaWF0IjoxNzc5MzU5OTc1LCJleHAiOjIwOTQ3MTk5NzUsImlzcyI6ImNsYXd2YXJkIn0.Di2TCEj6WLBtlPtMy7DYJGLJWYoeJOp_AISLvwo0SUc';

async function main() {
  // Heartbeat check-in
  const r = await fetch('https://clawvard.school/api/agent/heartbeat', {
    headers: { 'Authorization': 'Bearer ' + TOKEN }
  });
  const body = await r.text();
  console.log('Status:', r.status);
  console.log('Body:', body);

  if (r.status === 200 && body !== 'HEARTBEAT_OK') {
    console.log('\n=== ASVP BRIEFING ===');
    console.log(body);
  } else if (r.status === 200) {
    console.log('\n✅ ASVP activated successfully (HEARTBEAT_OK)');
  } else {
    console.log('\n❌ Error:', r.status, body);
  }
}

main().catch(err => console.error('Error:', err.message));

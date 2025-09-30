import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/tmp/why-not-posted.json', 'utf8'));

// Find records with STATUS EXTRACTION FAILED
const failed = data.analyses.filter((a: any) =>
  a.steps.some((s: any) => s.step === 'STATUS EXTRACTION FAILED')
);

console.log(`Found ${failed.length} records with STATUS EXTRACTION FAILED\n`);

if (failed.length > 0) {
  const first = failed[0];
  console.log('First failed record Full Result:');
  console.log('='.repeat(80));
  console.log(first.record.fullResult);
  console.log('='.repeat(80));

  // Try to find status patterns
  const patterns = [
    /NOTE STATUS:\s*([^\n]+)/i,
    /Status:\s*([^\n]+)/i,
    /STATUS:\s*([^\n]+)/i,
  ];

  console.log('\nTrying different patterns:');
  patterns.forEach((pattern, idx) => {
    const match = first.record.fullResult.match(pattern);
    console.log(`Pattern ${idx + 1}: ${pattern} -> ${match ? match[1].trim() : 'NO MATCH'}`);
  });
}

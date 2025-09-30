import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/tmp/why-not-posted.json', 'utf8'));

const statuses = new Set<string>();

data.analyses.forEach((analysis: any) => {
  analysis.steps.forEach((step: any) => {
    // Look for steps that are statuses (not filters)
    const stepName = step.step;
    if (stepName !== 'Verifiable Fact Filter' &&
        stepName !== 'Generated Note' &&
        !stepName.includes('Filter') &&
        !stepName.includes('Prediction') &&
        !stepName.includes('Score') &&
        stepName !== 'No Note Generated' &&
        stepName !== 'Unknown Reason') {
      statuses.add(stepName);
    }
  });
});

console.log('Unique note statuses found:');
Array.from(statuses).sort().forEach(status => {
  console.log(`  - ${status}`);
});

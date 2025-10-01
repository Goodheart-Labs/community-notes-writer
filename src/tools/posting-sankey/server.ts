import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.POSTING_SANKEY_PORT || 3005;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY!,
}).base(process.env.AIRTABLE_BASE_ID!);

interface NoteRecord {
  id: string;
  url: string;
  botName: string;
  finalNote?: string;
  wouldBePosted?: number;
  createdTime?: string;
  fullResult?: string;
  noteStatus?: string;
  // Filter scores - new structure
  notSarcasmFilter?: number;
  urlValidityFilter?: number;
  urlSourceFilter?: number;
  positiveClaimsFilter?: number;
  significantCorrectionFilter?: number;
  helpfulnessPrediction?: number;
  xApiScore?: number;
}

interface PipelineStep {
  step: string;
  passed: boolean;
  score?: number;
  threshold?: number;
}

interface AnalysisResult {
  record: NoteRecord;
  steps: PipelineStep[];
  failedAt?: string;
}

interface SankeyData {
  nodes: { name: string }[];
  links: { source: number; target: number; value: number }[];
}

// Extract note status from Full Result
function extractNoteStatus(fullResult: string | undefined): string | undefined {
  if (!fullResult) return undefined;

  // Try primary pattern: "NOTE STATUS: <status>"
  let match = fullResult.match(/NOTE STATUS:\s*([^\n]+)/i);
  if (match) {
    const status = match[1].trim();
    if (status !== 'Reasoning:' && status.length >= 3) {
      return status;
    }
  }

  // Try secondary pattern in SKIP REASON: "Status: <status>"
  match = fullResult.match(/SKIP REASON:\s*Status:\s*([^\n]+)/i);
  if (match) {
    const status = match[1].trim();
    if (status !== 'Reasoning:' && status.length >= 3) {
      return status;
    }
  }

  // If status extraction failed or is incomplete, search for exact phrases in the body
  if (fullResult.includes('NO SUPPORTING SOURCE FOUND')) {
    return 'NO SUPPORTING SOURCE FOUND';
  }
  if (fullResult.includes('NO MISSING CONTEXT')) {
    return 'NO MISSING CONTEXT';
  }
  if (fullResult.includes('TWEET NOT SIGNIFICANTLY INCORRECT')) {
    return 'TWEET NOT SIGNIFICANTLY INCORRECT';
  }
  if (fullResult.includes('CORRECTION WITH TRUSTWORTHY CITATION')) {
    return 'CORRECTION WITH TRUSTWORTHY CITATION';
  }

  return undefined;
}

// Analyze why a note wasn't posted
function analyzeNote(record: NoteRecord): AnalysisResult {
  const steps: PipelineStep[] = [];
  let failedAt: string | undefined;

  const noteStatus = extractNoteStatus(record.fullResult);

  // Step 1: Verifiable Fact Filter (runs FIRST, before note generation)
  if (record.notSarcasmFilter !== undefined) {
    const passed = record.notSarcasmFilter > 0.5;
    steps.push({
      step: 'Verifiable Fact Filter',
      passed,
      score: record.notSarcasmFilter,
      threshold: 0.5,
    });
    if (!passed && !failedAt) failedAt = 'Verifiable Fact Filter';
  }

  // Step 2: Has final note (keywords, search, note generation)
  const hasFinalNote = !!record.finalNote && record.finalNote.trim().length > 0;
  steps.push({
    step: 'Generated Note',
    passed: hasFinalNote,
  });
  if (!hasFinalNote && !failedAt) failedAt = 'No Note Generated';

  // Step 3: Note status - every generated note should have a status
  if (hasFinalNote) {
    if (noteStatus) {
      const isCorrection = noteStatus === 'CORRECTION WITH TRUSTWORTHY CITATION';
      steps.push({
        step: noteStatus,
        passed: isCorrection,
      });
      if (!isCorrection && !failedAt) failedAt = noteStatus;

      // Only continue with filters if status is CORRECTION
      if (!isCorrection) {
        return { record, steps, failedAt };
      }
    } else {
      // Has note but no status - shouldn't happen but handle it
      steps.push({
        step: 'Unknown Status',
        passed: false,
      });
      failedAt = 'Unknown Status';
      return { record, steps, failedAt };
    }
  } else {
    // No note generated, stop here
    return { record, steps, failedAt };
  }

  // Step 4: URL Quality filter (only if it actually ran)
  if (record.urlValidityFilter !== undefined) {
    const passed = record.urlValidityFilter > 0.5;
    steps.push({
      step: 'URL Quality Filter',
      passed,
      score: record.urlValidityFilter,
      threshold: 0.5,
    });
    if (!passed && !failedAt) failedAt = 'URL Quality Filter';
  }

  // Step 5: URL Content filter (only if it actually ran)
  if (record.urlSourceFilter !== undefined) {
    const passed = record.urlSourceFilter > 0.5;
    steps.push({
      step: 'URL Content Filter',
      passed,
      score: record.urlSourceFilter,
      threshold: 0.5,
    });
    if (!passed && !failedAt) failedAt = 'URL Content Filter';
  }

  // Step 6: Positive claims filter (only if it actually ran)
  if (record.positiveClaimsFilter !== undefined) {
    const passed = record.positiveClaimsFilter > 0.5;
    steps.push({
      step: 'Positive Claims Filter',
      passed,
      score: record.positiveClaimsFilter,
      threshold: 0.5,
    });
    if (!passed && !failedAt) failedAt = 'Positive Claims Filter';
  }

  // Step 7: Disagreement filter (only if it actually ran)
  if (record.significantCorrectionFilter !== undefined) {
    const passed = record.significantCorrectionFilter > 0.5;
    steps.push({
      step: 'Disagreement Filter',
      passed,
      score: record.significantCorrectionFilter,
      threshold: 0.5,
    });
    if (!passed && !failedAt) failedAt = 'Disagreement Filter';
  }

  // Step 8: Helpfulness prediction (informational only, always passes now)
  if (record.helpfulnessPrediction !== undefined) {
    steps.push({
      step: 'Helpfulness Prediction',
      passed: true,  // Always passes now - informational only
      score: record.helpfulnessPrediction,
    });
    // Don't set failedAt for helpfulness anymore
  }

  // Step 9: X API Score (only if it actually ran)
  if (record.xApiScore !== undefined) {
    const passed = record.xApiScore >= -0.5;  // Updated threshold
    steps.push({
      step: 'X API Score',
      passed,
      score: record.xApiScore,
      threshold: -0.5,
    });
    if (!passed && !failedAt) failedAt = 'X API Score';
  }

  // If no failure detected yet, it must be something else
  if (!failedAt) {
    failedAt = 'Unknown Reason';
  }

  return {
    record,
    steps,
    failedAt,
  };
}

// Generate Sankey diagram data
function generateSankeyData(analyses: AnalysisResult[]): SankeyData {
  const flowCounts = new Map<string, number>();

  for (const analysis of analyses) {
    // Start all flows from "Start" to first step
    if (analysis.steps.length > 0) {
      const firstStep = analysis.steps[0].step;
      const key = `Start→${firstStep}`;
      flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
    }

    let prevStep = analysis.steps.length > 0 ? analysis.steps[0].step : 'Start';
    let firstStepPassed = analysis.steps.length > 0 ? analysis.steps[0].passed : false;

    // If first step failed, record it and stop
    if (analysis.steps.length > 0 && !analysis.steps[0].passed) {
      const key = `${prevStep}→Failed: ${prevStep}`;
      flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
      continue;
    }

    // Process remaining steps
    for (let i = 1; i < analysis.steps.length; i++) {
      const step = analysis.steps[i];
      const currentStep = step.step;

      if (step.passed) {
        // Passed this step, continue to next
        const key = `${prevStep}→${currentStep}`;
        flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
        prevStep = currentStep;
      } else {
        // Failed at this step
        const key = `${prevStep}→Failed: ${currentStep}`;
        flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
        break;
      }
    }

    // If all tracked steps passed
    if (analysis.steps.every(s => s.passed)) {
      const lastStep = analysis.steps[analysis.steps.length - 1].step;
      // Check if actually posted or not
      if (analysis.record.wouldBePosted === 1) {
        const key = `${lastStep}→Posted`;
        flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
      } else {
        // Passed all tracked filters but still not posted
        const key = `${lastStep}→Passed All Tracked Filters`;
        flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
      }
    }
  }

  // Build nodes and links with proper ordering to minimize crossings
  const nodeNames = new Set<string>();
  nodeNames.add('Start');

  for (const [flow] of flowCounts) {
    const [source, target] = flow.split('→');
    nodeNames.add(source);
    nodeNames.add(target);
  }

  // Sort nodes to minimize crossings
  // Order: Start, then pipeline steps, then failure nodes grouped by step, then Posted
  const pipelineOrder = [
    'Start',
    'Verifiable Fact Filter',
    'Generated Note',
    'CORRECTION WITH TRUSTWORTHY CITATION',
    'NO SUPPORTING SOURCE FOUND',
    'NO MISSING CONTEXT',
    'TWEET NOT SIGNIFICANTLY INCORRECT',
    'STATUS EXTRACTION FAILED',
    'URL Quality Filter',
    'URL Content Filter',
    'Positive Claims Filter',
    'Disagreement Filter',
    'Helpfulness Prediction',
    'X API Score',
    // Failure nodes in order from bottom to top of image
    'Failed: Verifiable Fact Filter',
    'Failed: NO SUPPORTING SOURCE FOUND',
    'Failed: NO MISSING CONTEXT',
    'Failed: TWEET NOT SIGNIFICANTLY INCORRECT',
    'Failed: URL Quality Filter',
    'Failed: URL Content Filter',
    'Failed: Positive Claims Filter',
    'Failed: Disagreement Filter',
    'Failed: X API Score',
    'Passed All Tracked Filters',
    'Posted',
  ];

  const sortedNodeNames = Array.from(nodeNames).sort((a, b) => {
    const aIndex = pipelineOrder.indexOf(a);
    const bIndex = pipelineOrder.indexOf(b);

    // Both in order list - sort by order
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;

    // Only a in list - a comes first
    if (aIndex !== -1) return -1;

    // Only b in list - b comes first
    if (bIndex !== -1) return 1;

    // Neither in list - group failures together at the end
    if (a.startsWith('Failed:') && b.startsWith('Failed:')) {
      return a.localeCompare(b);
    }
    if (a.startsWith('Failed:')) return 1;
    if (b.startsWith('Failed:')) return -1;

    return a.localeCompare(b);
  });

  const nodes = sortedNodeNames.map(name => ({ name }));
  const nodeIndexMap = new Map(nodes.map((n, i) => [n.name, i]));

  const links = Array.from(flowCounts.entries()).map(([flow, count]) => {
    const [source, target] = flow.split('→');
    return {
      source: nodeIndexMap.get(source)!,
      target: nodeIndexMap.get(target)!,
      value: count,
    };
  });

  return { nodes, links };
}

// Fetch and analyze not-posted notes
app.get('/api/why-not-posted', async (req: Request, res: Response) => {
  try {
    const {
      branch = 'all',
      limit = '100'
    } = req.query;

    const maxRecords = parseInt(limit as string);
    const records: NoteRecord[] = [];

    // Fetch all records (both posted and not posted) to see the full pipeline
    let filterFormula = '';
    if (branch && branch !== 'all') {
      filterFormula = `{Bot name} = '${branch}'`;
    }

    await base(process.env.AIRTABLE_TABLE_NAME!)
      .select({
        filterByFormula: filterFormula,
        sort: [{ field: 'Created', direction: 'desc' }],
        maxRecords,
        fields: [
          'URL',
          'Bot name',
          'Final note',
          'Would be posted',
          'Created',
          'Full Result',
          'Not sarcasm filter',
          'Positive claims only filter',
          'Significant correction filter',
          'Helpfulness Prediction',
          'X API Score',
        ],
      })
      .eachPage((airtableRecords, fetchNextPage) => {
        airtableRecords.forEach((record) => {
          records.push({
            id: record.id,
            url: record.get('URL') as string || '',
            botName: record.get('Bot name') as string || '',
            finalNote: record.get('Final note') as string,
            wouldBePosted: record.get('Would be posted') as number,
            createdTime: record.get('Created') as string,
            fullResult: record.get('Full Result') as string,
            notSarcasmFilter: record.get('Not sarcasm filter') as number,
            urlValidityFilter: undefined,  // Not stored separately yet
            urlSourceFilter: undefined,     // Not stored separately yet
            positiveClaimsFilter: record.get('Positive claims only filter') as number,
            significantCorrectionFilter: record.get('Significant correction filter') as number,
            helpfulnessPrediction: record.get('Helpfulness Prediction') as number,
            xApiScore: record.get('X API Score') as number,
          });
        });
        fetchNextPage();
      });

    // Analyze each record
    const analyses = records.map(analyzeNote);

    // Generate Sankey data
    const sankeyData = generateSankeyData(analyses);

    // Count failures by step
    const failureCounts = new Map<string, number>();
    for (const analysis of analyses) {
      if (analysis.failedAt) {
        failureCounts.set(
          analysis.failedAt,
          (failureCounts.get(analysis.failedAt) || 0) + 1
        );
      }
    }

    const failureBreakdown = Array.from(failureCounts.entries())
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      totalAnalyzed: records.length,
      analyses,
      sankeyData,
      failureBreakdown,
    });

  } catch (error) {
    console.error('[posting-sankey] Error:', error);
    res.status(500).json({
      error: 'Failed to analyze notes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Serve the HTML file
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Posting Sankey running on http://localhost:${PORT}`);
});

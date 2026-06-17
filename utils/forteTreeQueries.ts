import {
  FORTE_FEATURE_TREE,
  FORTE_INDUSTRY_STANDARDS,
  type ForteFeatureNode,
  type ForteTreeDomain,
  type ForteTreePriority,
  type ForteTreeStatus,
} from '../features/forteTree';

export interface ForteTreeQuery {
  domain?: ForteTreeDomain;
  status?: ForteTreeStatus;
  priority?: ForteTreePriority;
  parentId?: string | null;
  text?: string;
  agentReadableOnly?: boolean;
}

export interface ForteTreeCoverage {
  total: number;
  byStatus: Record<ForteTreeStatus, number>;
  byDomain: Record<ForteTreeDomain, number>;
  p0Gaps: number;
  nativeOrEmbedded: number;
}

export interface ForteEmbeddingRecord {
  id: string;
  domain: ForteTreeDomain;
  status: ForteTreeStatus;
  priority: ForteTreePriority;
  text: string;
  metadata: {
    label: string;
    dataEntities: string[];
    deterministicQueries: string[];
    sourceSignalIds: string[];
  };
}

const DOMAIN_ORDER: ForteTreeDomain[] = [
  'command',
  'people',
  'scheduling',
  'learning',
  'finance',
  'resources',
  'platform',
  'agent',
];

const STATUS_ORDER: ForteTreeStatus[] = ['native', 'embedded', 'planned', 'gap'];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function searchableText(node: ForteFeatureNode): string {
  return [
    node.id,
    node.label,
    node.labelHe,
    node.shape,
    node.industryStandard,
    node.cadenzaFit,
    node.nextStep,
    node.dataEntities.join(' '),
    node.deterministicQueries.join(' '),
    node.embeddingText,
  ].join(' ');
}

export function getForteFeatureById(id: string): ForteFeatureNode | undefined {
  return FORTE_FEATURE_TREE.find(node => node.id === id);
}

export function getForteFeatureChildren(parentId?: string): ForteFeatureNode[] {
  return FORTE_FEATURE_TREE
    .filter(node => (parentId ? node.parentId === parentId : !node.parentId))
    .sort(compareForteNodes);
}

export function queryForteTree(query: ForteTreeQuery = {}): ForteFeatureNode[] {
  const q = query.text ? normalize(query.text) : '';

  return FORTE_FEATURE_TREE
    .filter(node => {
      if (query.domain && node.domain !== query.domain) return false;
      if (query.status && node.status !== query.status) return false;
      if (query.priority && node.priority !== query.priority) return false;
      if (query.parentId !== undefined) {
        const wanted = query.parentId || undefined;
        if (node.parentId !== wanted) return false;
      }
      if (query.agentReadableOnly && node.agentReadable.canonicalFields.length === 0) return false;
      if (q && !normalize(searchableText(node)).includes(q)) return false;
      return true;
    })
    .sort(compareForteNodes);
}

export function getForteIndustryGaps(minimumPriority: ForteTreePriority = 'p1'): ForteFeatureNode[] {
  const allowed =
    minimumPriority === 'p0'
      ? new Set<ForteTreePriority>(['p0'])
      : minimumPriority === 'p1'
        ? new Set<ForteTreePriority>(['p0', 'p1'])
        : new Set<ForteTreePriority>(['p0', 'p1', 'p2']);

  return FORTE_FEATURE_TREE
    .filter(node => allowed.has(node.priority) && (node.status === 'gap' || node.status === 'planned'))
    .sort(compareForteNodes);
}

export function summarizeForteCoverage(nodes: ForteFeatureNode[] = FORTE_FEATURE_TREE): ForteTreeCoverage {
  const byStatus = Object.fromEntries(STATUS_ORDER.map(status => [status, 0])) as Record<ForteTreeStatus, number>;
  const byDomain = Object.fromEntries(DOMAIN_ORDER.map(domain => [domain, 0])) as Record<ForteTreeDomain, number>;

  for (const node of nodes) {
    byStatus[node.status] += 1;
    byDomain[node.domain] += 1;
  }

  return {
    total: nodes.length,
    byStatus,
    byDomain,
    p0Gaps: nodes.filter(node => node.priority === 'p0' && node.status === 'gap').length,
    nativeOrEmbedded: nodes.filter(node => node.status === 'native' || node.status === 'embedded').length,
  };
}

export function buildForteEmbeddingRecords(nodes: ForteFeatureNode[] = FORTE_FEATURE_TREE): ForteEmbeddingRecord[] {
  return [...nodes].sort(compareForteNodes).map(node => ({
    id: node.id,
    domain: node.domain,
    status: node.status,
    priority: node.priority,
    text: [
      `Feature: ${node.label}`,
      `Domain: ${node.domain}`,
      `Status: ${node.status}`,
      `Shape: ${node.shape}`,
      `Industry standard: ${node.industryStandard}`,
      `Cadenza fit: ${node.cadenzaFit}`,
      `Next step: ${node.nextStep}`,
      `Data entities: ${node.dataEntities.join(', ')}`,
      `Deterministic queries: ${node.deterministicQueries.join(', ')}`,
      `Embedding: ${node.embeddingText}`,
    ].join('\n'),
    metadata: {
      label: node.label,
      dataEntities: node.dataEntities,
      deterministicQueries: node.deterministicQueries,
      sourceSignalIds: node.sourceSignalIds,
    },
  }));
}

export function getForteStandardCoverage(): Array<{
  standardId: string;
  label: string;
  requirement: string;
  relatedFeatures: ForteFeatureNode[];
}> {
  return FORTE_INDUSTRY_STANDARDS.map(standard => {
    const relatedFeatures = FORTE_FEATURE_TREE.filter(node => {
      const text = normalize(`${node.industryStandard} ${node.shape} ${node.embeddingText}`);
      return normalize(standard.requirement)
        .split(' ')
        .filter(part => part.length > 5)
        .some(part => text.includes(part));
    });

    return {
      standardId: standard.id,
      label: standard.label,
      requirement: standard.requirement,
      relatedFeatures,
    };
  });
}

function compareForteNodes(a: ForteFeatureNode, b: ForteFeatureNode): number {
  const priorityRank = { p0: 0, p1: 1, p2: 2 } satisfies Record<ForteTreePriority, number>;
  const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const domainDelta = DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain);
  if (domainDelta !== 0) return domainDelta;

  const statusDelta = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (statusDelta !== 0) return statusDelta;

  return a.label.localeCompare(b.label);
}

import { DiscourseState, TopicFrame } from '@/types';

const TOPIC_SHIFT_PATTERNS = [
  /\b(by the way|btw|speaking of|unrelated|another thing|also|oh and|changing topic|different question)\b/i,
  /\b(anyway|moving on|back to|let's talk about|what about|how about)\b/i,
];

const RESOLUTION_PATTERNS = [
  /\b(got it|understood|makes sense|clear|thank|perfect|exactly|that's what i needed|solved)\b/i,
  /\b(great|awesome|wonderful|excellent|that works|that helps)\b/i,
];

const FRUSTRATION_PATTERNS = [
  /\b(not what i asked|that's not|wrong|no no|i said|already told|again|still not|doesn't work|try again)\b/i,
  /\b(ugh|sigh|come on|seriously|useless|terrible)\b/i,
];

const DEEPENING_PATTERNS = [
  /\b(more about|tell me more|elaborate|go deeper|what else|expand on|explain further|keep going)\b/i,
  /\b(specifically|in particular|for example|such as|like what)\b/i,
];

function extractTopicSignature(text: string): string {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'must', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'it', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'my',
    'your', 'his', 'her', 'our', 'their', 'what', 'which', 'who', 'whom',
    'how', 'why', 'when', 'where', 'not', 'no', 'but', 'and', 'or', 'if',
    'about', 'just', 'very', 'really', 'so', 'too', 'also', 'please',
    'much', 'more', 'some', 'any', 'all', 'than', 'then', 'into',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)
    .join(' ');
}

function computeTopicOverlap(topic1: string, topic2: string): number {
  const words1 = new Set(topic1.split(' '));
  const words2 = new Set(topic2.split(' '));
  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap++;
  }

  return overlap / Math.max(words1.size, words2.size);
}

export function analyzeDiscourse(
  userMessage: string,
  recentMessages: unknown[],
  previousDiscourse: DiscourseState | null
): DiscourseState {
  const turnCount = (previousDiscourse?.turnCount ?? 0) + 1;
  const topicStack = previousDiscourse?.topicStack ? [...previousDiscourse.topicStack] : [];
  const resolvedTopics = previousDiscourse?.resolvedTopics ? [...previousDiscourse.resolvedTopics] : [];
  const pendingQuestions = previousDiscourse?.pendingQuestions ? [...previousDiscourse.pendingQuestions] : [];

  const currentTopicSig = extractTopicSignature(userMessage);

  const previousTopic = topicStack.length > 0 ? topicStack[topicStack.length - 1].topic : '';
  const topicOverlap = previousTopic ? computeTopicOverlap(currentTopicSig, previousTopic) : 0;

  const hasExplicitShift = TOPIC_SHIFT_PATTERNS.some(p => p.test(userMessage));
  const topicShiftDetected = hasExplicitShift || (topicOverlap < 0.15 && turnCount > 1 && currentTopicSig.length > 0);

  if (topicShiftDetected || topicStack.length === 0) {
    const relatedTopics = topicStack
      .filter(t => computeTopicOverlap(t.topic, currentTopicSig) > 0.2)
      .map(t => t.topic);

    topicStack.push({
      topic: currentTopicSig,
      enteredAt: Date.now(),
      turnIndex: turnCount,
      depth: 0,
      resolved: false,
      relatedTopics,
    });
  } else {
    const current = topicStack[topicStack.length - 1];
    const isDeepening = DEEPENING_PATTERNS.some(p => p.test(userMessage));
    if (isDeepening) {
      current.depth++;
    }
  }

  const isResolved = RESOLUTION_PATTERNS.some(p => p.test(userMessage));
  if (isResolved && topicStack.length > 0) {
    const resolving = topicStack[topicStack.length - 1];
    resolving.resolved = true;
    resolvedTopics.push(resolving.topic);
  }

  const isFrustrated = FRUSTRATION_PATTERNS.some(p => p.test(userMessage));

  const questionMatches = userMessage.match(/[^.!]*\?/g) ?? [];
  for (const q of questionMatches) {
    const trimmed = q.trim();
    if (trimmed.length > 10) {
      pendingQuestions.push(trimmed);
    }
  }

  if (pendingQuestions.length > 6) {
    pendingQuestions.splice(0, pendingQuestions.length - 6);
  }

  if (topicStack.length > 10) {
    topicStack.splice(0, topicStack.length - 10);
  }

  let conversationPhase: DiscourseState['conversationPhase'] = 'exploration';
  if (turnCount <= 2) {
    conversationPhase = 'opening';
  } else if (topicStack.length > 0 && topicStack[topicStack.length - 1].depth >= 2) {
    conversationPhase = 'deep_dive';
  } else if (isResolved && turnCount > 4) {
    conversationPhase = 'resolution';
  } else if (/\b(bye|goodbye|see you|later|gotta go|done|that's all)\b/i.test(userMessage)) {
    conversationPhase = 'closing';
  }

  const coherenceScore = topicShiftDetected ? 0.4 : Math.min(1, 0.6 + topicOverlap * 0.4);

  let engagementLevel = previousDiscourse?.engagementLevel ?? 0.5;
  if (userMessage.length > 100) engagementLevel = Math.min(1, engagementLevel + 0.1);
  if (userMessage.length < 20) engagementLevel = Math.max(0.1, engagementLevel - 0.05);
  if (DEEPENING_PATTERNS.some(p => p.test(userMessage))) engagementLevel = Math.min(1, engagementLevel + 0.15);
  if (isFrustrated) engagementLevel = Math.max(0.1, engagementLevel - 0.2);
  if (isResolved) engagementLevel = Math.min(1, engagementLevel + 0.05);

  let userSatisfaction = previousDiscourse?.userSatisfaction ?? 0.7;
  if (isResolved) userSatisfaction = Math.min(1, userSatisfaction + 0.1);
  if (isFrustrated) userSatisfaction = Math.max(0, userSatisfaction - 0.25);
  if (/\b(thanks|thank you|perfect|great|awesome|love it)\b/i.test(userMessage)) {
    userSatisfaction = Math.min(1, userSatisfaction + 0.15);
  }

  const threadDepth = topicStack.length > 0 ? topicStack[topicStack.length - 1].depth : 0;

  console.log('[DISCOURSE] Analysis:', {
    turnCount,
    phase: conversationPhase,
    topicShift: topicShiftDetected,
    coherence: coherenceScore.toFixed(2),
    engagement: engagementLevel.toFixed(2),
    satisfaction: userSatisfaction.toFixed(2),
    threadDepth,
    pendingQ: pendingQuestions.length,
  });

  return {
    turnCount,
    topicStack,
    currentTopic: currentTopicSig,
    topicShiftDetected,
    conversationPhase,
    coherenceScore,
    engagementLevel,
    userSatisfaction,
    threadDepth,
    pendingQuestions: pendingQuestions.slice(-4),
    resolvedTopics,
  };
}

export function buildDiscourseInjection(discourse: DiscourseState): string {
  const parts: string[] = [];

  if (discourse.topicShiftDetected) {
    parts.push(`Topic shift detected. Smoothly transition to the new subject. Don't reference the old topic unless the user does.`);
  }

  if (discourse.threadDepth >= 2) {
    parts.push(`Deep thread (depth ${discourse.threadDepth}). The user wants to go deeper. Provide increasingly specific, nuanced information. Avoid surface-level repetition.`);
  }

  if (discourse.userSatisfaction < 0.4) {
    parts.push(`LOW USER SATISFACTION (${(discourse.userSatisfaction * 100).toFixed(0)}%). The user may be frustrated with previous responses. Pay extra attention to what they're actually asking. Be more precise and directly address their concern.`);
  }

  if (discourse.pendingQuestions.length > 1) {
    parts.push(`Multiple pending questions detected (${discourse.pendingQuestions.length}). Make sure to address each one: ${discourse.pendingQuestions.slice(-3).join(' | ')}`);
  }

  switch (discourse.conversationPhase) {
    case 'opening':
      parts.push(`Opening phase. Set a welcoming tone and establish rapport.`);
      break;
    case 'deep_dive':
      parts.push(`Deep dive phase. Provide maximum depth, technical detail, and nuance. The user is invested in this topic.`);
      break;
    case 'resolution':
      parts.push(`Resolution phase. Summarize key takeaways and offer next steps if applicable.`);
      break;
    case 'closing':
      parts.push(`Closing phase. Be warm and concise. Offer a brief summary if the conversation was substantial.`);
      break;
  }

  if (discourse.engagementLevel < 0.3) {
    parts.push(`Low engagement detected. Try to re-engage: ask a relevant follow-up question, offer an interesting angle, or provide a practical example.`);
  }

  if (parts.length === 0) return '';
  return '## Conversation Dynamics\n' + parts.join('\n');
}

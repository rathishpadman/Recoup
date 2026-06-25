import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface SourceFile {
  path: string;
  source: string;
}

const mayaComponentRoot = "cockpit/components/maya";
const promptCollectionPattern = "(?:queryPromptChips|promptChips|prebuiltPrompts|promptSuggestions|suggestedQueries|querySuggestions)";
const assertOrExpectPatternSource = String.raw`\b(?:assert|expect)\s*\(`;
const renderedValuePatternSource = String.raw`\b(?:locator|getByTestId|allTextContents|innerText|textContent|evaluateAll|count|getAttribute)\b`;

interface LabeledPattern {
  label: string;
  pattern: RegExp;
}

interface FunctionDefinition {
  body: string;
  end: number;
  isAsync: boolean;
  name: string;
  start: number;
}

interface E2eHelperRequirement {
  allowExplicitFailClosedState?: boolean;
  helperName: string;
  requiredBodyPatterns?: readonly LabeledPattern[];
  requiredHooks?: readonly string[];
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readMayaComponent(fileName: string): string {
  return read(join(mayaComponentRoot, fileName).replace(/\\/g, "/"));
}

function cssVariables(source: string, names: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      new RegExp(`--${escapeRegExp(name)}:\\s*([^;]+);`, "u").exec(source)?.[1]?.trim()
    ])
  );
}

function readMayaProductionFiles(): SourceFile[] {
  return readdirSync(mayaComponentRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => {
      const path = join(mayaComponentRoot, entry.name).replace(/\\/g, "/");
      return { path, source: read(path) };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function readMayaUiAndE2ESources(): SourceFile[] {
  return [
    ...readMayaProductionFiles(),
    {
      path: "cockpit/app/cockpit-data.ts",
      source: read("cockpit/app/cockpit-data.ts")
    },
    {
      path: "cockpit/app/forensics/shadcn/page.tsx",
      source: read("cockpit/app/forensics/shadcn/page.tsx")
    },
    {
      path: "tests/e2e/maya-real-backend-e2e.ts",
      source: read("tests/e2e/maya-real-backend-e2e.ts")
    }
  ];
}

function matchingLines(files: readonly SourceFile[], pattern: RegExp): string[] {
  const matches: string[] = [];
  for (const file of files) {
    file.source.split(/\r?\n/u).forEach((line, index) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        matches.push(`${file.path}:${String(index + 1)} ${line.trim()}`);
      }
      pattern.lastIndex = 0;
    });
  }

  return matches;
}

function matchingLabeledLines(files: readonly SourceFile[], patterns: readonly LabeledPattern[]): string[] {
  const matches: string[] = [];
  for (const { label, pattern } of patterns) {
    for (const line of matchingLines(files, pattern)) {
      matches.push(`${label}: ${line}`);
    }
  }

  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripComments(source: string): string {
  let stripped = "";
  let index = 0;
  let state: "block-comment" | "code" | "double" | "line-comment" | "single" | "template" = "code";

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        stripped += char;
      } else {
        stripped += char === "\r" ? char : " ";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        stripped += "  ";
        index += 2;
        state = "code";
      } else {
        stripped += char === "\n" || char === "\r" ? char : " ";
        index += 1;
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      stripped += char;
      if (char === "\\") {
        stripped += next;
        index += 2;
        continue;
      }
      if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
        state = "code";
      }
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      stripped += "  ";
      index += 2;
      state = "line-comment";
      continue;
    }
    if (char === "/" && next === "*") {
      stripped += "  ";
      index += 2;
      state = "block-comment";
      continue;
    }
    if (char === "'") {
      state = "single";
    } else if (char === '"') {
      state = "double";
    } else if (char === "`") {
      state = "template";
    }
    stripped += char;
    index += 1;
  }

  return stripped;
}

function hasJsxDataTestId(source: string, testId: string): boolean {
  const escapedTestId = escapeRegExp(testId);
  return new RegExp(
    `<[A-Za-z][\\w.:]*\\b[^>]*\\bdata-testid\\s*=\\s*(?:"${escapedTestId}"|'${escapedTestId}'|\\{\\s*["']${escapedTestId}["']\\s*\\})`,
    "u"
  ).test(stripComments(source));
}

function missingJsxTestIds(source: string, testIds: readonly string[]): string[] {
  return testIds.filter((testId) => !hasJsxDataTestId(source, testId));
}

function jsxDataTestIdContextHas(source: string, testId: string, pattern: RegExp, radius = 1_200): boolean {
  const stripped = stripComments(source);
  const escapedTestId = escapeRegExp(testId);
  const dataTestIdPattern = new RegExp(
    `\\bdata-testid\\s*=\\s*(?:"${escapedTestId}"|'${escapedTestId}'|\\{\\s*["']${escapedTestId}["']\\s*\\})`,
    "u"
  );
  const match = dataTestIdPattern.exec(stripped);
  if (match === null) {
    return false;
  }

  pattern.lastIndex = 0;
  const context = stripped.slice(match.index, match.index + radius);
  const matched = pattern.test(context);
  pattern.lastIndex = 0;

  return matched;
}

function missingAssistantCitationRequirements(source: string): string[] {
  const missing: string[] = [];
  if (!jsxDataTestIdContextHas(source, "maya-query-assistant-message", /\b(?:snapshot|response)\.citations\b/u, 1_600)) {
    missing.push("assistant message does not render backend citation collection");
  }
  if (!jsxDataTestIdContextHas(source, "maya-query-assistant-message", /\b(?:recordIds|recordId)\b/u, 1_600)) {
    missing.push("assistant message does not render backend citation record IDs");
  }

  return missing;
}

function assistantMessageHookTargetsStatusBubble(source: string): boolean {
  return /<div\b(?=[^>]*\bclassName="grid min-w-0 gap-2 rounded-lg border bg-background p-3")(?=[^>]*\bdata-testid="maya-query-assistant-message")[^>]*>/u.test(
    stripComments(source)
  );
}

function missingPromptReadModelContract(typesSource: string, cockpitDataSource: string): string[] {
  const missing: string[] = [];
  if (!new RegExp(`\\b${promptCollectionPattern}\\??\\s*:`, "u").test(stripComments(typesSource))) {
    missing.push("types missing prompt collection property on Maya read-model contract");
  }
  if (!new RegExp(`\\b${promptCollectionPattern}\\b`, "u").test(stripComments(cockpitDataSource))) {
    missing.push("cockpit-data missing source-backed prompt collection field");
  }

  return missing;
}

function extractPromptSuggestionMapContexts(source: string): Array<{ context: string; parameterName: string }> {
  const stripped = stripComments(source);
  const promptMapPattern = new RegExp(
    `\\bdock\\.${promptCollectionPattern}\\??\\.map\\s*\\(\\s*\\(?\\s*([A-Za-z_$][\\w$]*)\\b`,
    "gu"
  );
  const contexts: Array<{ context: string; parameterName: string }> = [];

  for (const match of stripped.matchAll(promptMapPattern)) {
    const index = match.index;
    contexts.push({
      context: stripped.slice(index, Math.min(stripped.length, index + 2_400)),
      parameterName: match[1] ?? "prompt"
    });
  }

  return contexts;
}

function jsxKeyExpression(context: string): string | undefined {
  return /\bkey\s*=\s*\{([\s\S]{0,360}?)\}/u.exec(context)?.[1]?.trim();
}

function promptKeyUsesBackendIdentity(source: string, keyExpression: string, parameterName: string): boolean {
  const escapedParameter = escapeRegExp(parameterName);
  const directBackendIdentityPattern = new RegExp(
    `\\b${escapedParameter}\\.(?:recordIds|provenance\\.(?:recordIds|deterministicBasis))\\b`,
    "u"
  );
  if (directBackendIdentityPattern.test(keyExpression)) {
    return true;
  }

  const helperCall = /^\s*([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*$/u.exec(keyExpression);
  if (helperCall === null || helperCall[2] !== parameterName) {
    return false;
  }

  const definition = findFunctionDefinition(stripComments(source), helperCall[1] ?? "");
  if (definition === undefined) {
    return false;
  }

  return /\b(?:prompt|chip|suggestion)\.(?:recordIds|provenance\.(?:recordIds|deterministicBasis))\b/u.test(
    definition.body
  );
}

function missingPromptChipKeyIdentityRequirements(source: string): string[] {
  const missing: string[] = [];
  const promptMapContexts = extractPromptSuggestionMapContexts(source);
  if (promptMapContexts.length === 0) {
    return ["query dock does not map backend prompt suggestions for chip rendering"];
  }

  for (const { context, parameterName } of promptMapContexts) {
    const keyExpression = jsxKeyExpression(context);
    if (keyExpression === undefined) {
      missing.push("prompt chip is missing a React key");
      continue;
    }

    const visibleLabelOnlyKeyPattern = new RegExp(
      `^${escapeRegExp(parameterName)}\\.(?:label|name|question|title)$`,
      "u"
    );
    if (visibleLabelOnlyKeyPattern.test(keyExpression)) {
      missing.push(`prompt chip key uses visible prompt text only: key={${keyExpression}}`);
    }
    if (!promptKeyUsesBackendIdentity(source, keyExpression, parameterName)) {
      missing.push("prompt chip key is missing backend provenance, deterministic basis, or record ID identity");
    }
  }

  return missing;
}

function missingPromptChipAccessibilityRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];
  const promptMapContexts = extractPromptSuggestionMapContexts(source);
  if (promptMapContexts.length === 0) {
    return ["query dock does not map backend prompt suggestions for chip rendering"];
  }

  for (const { context, parameterName } of promptMapContexts) {
    if (!/\baria-describedby\s*=\s*\{[^}]*prompt(?:Chip)?(?:Basis|Description)[^}]*Id[^}]*\}/u.test(context)) {
      missing.push("prompt chip deterministic basis is only exposed by hover/title, not an accessible description");
    }
    if (!new RegExp(`\\b${escapeRegExp(parameterName)}\\.provenance\\.deterministicBasis\\b`, "u").test(context)) {
      missing.push("prompt chip accessible details do not include backend deterministic basis");
    }
  }

  if (!/\bid\s*=\s*\{[^}]*prompt(?:Chip)?(?:Basis|Description)[^}]*Id[^}]*\}/u.test(stripped)) {
    missing.push("prompt chip aria-describedby target is missing");
  }
  if (!/\bclassName\s*=\s*(?:"sr-only"|'sr-only')/u.test(stripped)) {
    missing.push("prompt chip provenance description is not hidden accessibly");
  }

  return missing;
}

function missingBlockedQuerySnapshotProvenanceRequirements(source: string): string[] {
  const snapshotMapper = findFunctionDefinition(stripComments(source), "toQueryEvidenceSnapshot");
  if (snapshotMapper === undefined) {
    return ["query dock is missing toQueryEvidenceSnapshot"];
  }

  const missing: string[] = [];
  if (/return\s*\{[\s\S]{0,600}\bcitations\s*:\s*\[\][\s\S]{0,600}\bstatus\s*:\s*"blocked"/u.test(snapshotMapper.body)) {
    missing.push("blocked query snapshot discards backend citations");
  }
  if (!/\bcitations\s*:\s*response\.citations\b/u.test(snapshotMapper.body)) {
    missing.push("blocked query snapshot does not preserve backend response.citations");
  }
  if (
    !/\bconst\s+blockedRecordIds\s*=\s*dedupeRecordIds\s*\(\s*\[[\s\S]{0,600}\.\.\.citedRecordIds[\s\S]{0,600}\.\.\.selectedScopeRecordIds/u.test(
      snapshotMapper.body
    )
  ) {
    missing.push("blocked query snapshot does not merge cited record IDs with selected-scope record IDs");
  }
  if (!/\brecordIds\s*:\s*blockedRecordIds\b[\s\S]{0,260}\bstatus\s*:\s*"blocked"/u.test(snapshotMapper.body)) {
    missing.push("blocked query snapshot does not publish merged blocked record IDs");
  }

  return missing;
}

function missingStrictQueryResponseCallbackRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];

  if (!/\bonResponse\s*:\s*\(\s*response\s*:\s*QueryEvidenceResponse\s*\)\s*=>\s*void\b/u.test(stripped)) {
    missing.push("query dock onResponse callback must accept a concrete QueryEvidenceResponse");
  }
  if (/\bonResponse\?\s*:|\bonResponse\?\.\s*\(/u.test(stripped)) {
    missing.push("query dock onResponse callback must not be optional");
  }
  if (!/\bonResponse\s*\(\s*next\s*\)/u.test(stripped)) {
    missing.push("query dock must publish concrete backend query snapshots through onResponse(next)");
  }
  if (/\b(?:onResponse|[A-Za-z_$][\w$]*Response[A-Za-z_$\w]*Ref\.current)\s*\(\s*undefined\s*\)/u.test(stripped)) {
    missing.push("query dock must not clear parent query state by publishing undefined");
  }

  return missing;
}

function missingQueryCloseResetRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];
  const closeActiveSession = findFunctionDefinition(stripped, "closeActiveSession") ?? findReactUseCallbackBody(stripped, "closeActiveSession");
  if (closeActiveSession === undefined) {
    return ["query dock is missing closeActiveSession trace reset logic"];
  }

  if (!/\bsessionTokenRef\.current\s*\+=\s*1\b/u.test(closeActiveSession.body)) {
    missing.push("closeActiveSession must invalidate the active backend query session token");
  }
  if (!/\babortControllerRef\.current\s*=\s*null\b/u.test(closeActiveSession.body)) {
    missing.push("closeActiveSession must detach the active abort controller");
  }
  if (!/\babortController\?\.\s*abort\s*\(\s*\)/u.test(closeActiveSession.body)) {
    missing.push("closeActiveSession must abort the active backend query session");
  }
  if (!/\bsetSnapshotEnvelope\s*\(\s*undefined\s*\)/u.test(closeActiveSession.body)) {
    missing.push("closeActiveSession no longer clears local stale query snapshot when required");
  }
  if (/\b(?:onResponse|[A-Za-z_$][\w$]*Response[A-Za-z_$\w]*Ref\.current)\s*\(\s*undefined\s*\)/u.test(closeActiveSession.body)) {
    missing.push("closeActiveSession must not clear parent query state through undefined callbacks");
  }
  if (/\bforceClear\b/u.test(stripped)) {
    missing.push("closeActiveSession forceClear option is unused and must not remain in the query dock contract");
  }
  const selectedEvidenceReset = findReactUseEffectCallbacks(stripped).find(
    (effect) =>
      /\bresetEvidenceIdentityRef\.current\s*=\s*selectedEvidenceIdentity\b/u.test(effect.body) &&
      /\bcloseActiveSession\s*\(\s*\)/u.test(effect.body)
  );
  if (selectedEvidenceReset === undefined) {
    missing.push("selected evidence reset must close the active backend query session");
  }

  return missing;
}

function missingStableQueryCloseLifecycleRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];
  const closeActiveSession = findReactUseCallbackBody(stripped, "closeActiveSession");
  if (closeActiveSession === undefined) {
    return ["query dock closeActiveSession must be a stable React.useCallback"];
  }

  const closeDependencies = reactUseCallbackDependencyList(stripped, "closeActiveSession");
  if (closeDependencies === undefined) {
    missing.push("closeActiveSession is missing an explicit dependency list");
  } else if (/\bsnapshot(?:Envelope)?\b|\bsnapshot\s*\?\.\s*status|\bsnapshot\.status/u.test(closeDependencies)) {
    missing.push("closeActiveSession dependency list must not include snapshot state or snapshot.status");
  }

  if (/\bsnapshot\s*\?\.\s*status|\bsnapshot\.status/u.test(closeActiveSession.body)) {
    missing.push("closeActiveSession must read answered-preservation status from a ref, not render snapshot state");
  }
  const unmountCleanups = findReactUseEffectCallbacks(stripped).filter(
    (effect) => /\breturn\s*\(\s*\)\s*=>/u.test(effect.body) && /\bcloseActiveSession\s*\(/u.test(effect.body)
  );
  if (unmountCleanups.length === 0) {
    missing.push("query dock unmount cleanup must close any active query session");
  }
  for (const cleanup of unmountCleanups) {
    if (/\bsnapshot(?:Envelope)?\b|\bsnapshot\s*\?\.\s*status|\bsnapshot\.status/u.test(cleanup.dependencies ?? "")) {
      missing.push("query dock unmount cleanup must not depend on snapshot state or snapshot.status");
    }
    if (
      /\bcloseActiveSession\b/u.test(cleanup.dependencies ?? "") &&
      /\bsnapshot(?:Envelope)?\b|\bsnapshot\s*\?\.\s*status|\bsnapshot\.status/u.test(closeDependencies ?? "")
    ) {
      missing.push("query dock unmount cleanup must not depend on status-volatile closeActiveSession");
    }
  }

  return missing;
}

function findReactUseCallbackBody(source: string, callbackName: string): FunctionDefinition | undefined {
  const match = new RegExp(`\\bconst\\s+${escapeRegExp(callbackName)}\\s*=\\s*React\\.useCallback\\s*\\(`, "u").exec(source);
  if (match === null) {
    return undefined;
  }

  const arrowIndex = source.indexOf("=>", match.index + match[0].length);
  if (arrowIndex < 0) {
    return undefined;
  }
  const openBraceIndex = source.indexOf("{", arrowIndex);
  if (openBraceIndex < 0) {
    return undefined;
  }
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
  if (closeBraceIndex === undefined) {
    return undefined;
  }

  return {
    body: source.slice(openBraceIndex + 1, closeBraceIndex),
    end: closeBraceIndex + 1,
    isAsync: false,
    name: callbackName,
    start: match.index
  };
}

function reactUseCallbackDependencyList(source: string, callbackName: string): string | undefined {
  const callback = findReactUseCallbackBody(source, callbackName);
  if (callback === undefined) {
    return undefined;
  }

  return reactHookDependencyListAfter(source, callback.end);
}

function reactHookDependencyListAfter(source: string, callbackEnd: number): string | undefined {
  return /,\s*(\[[\s\S]*?\])\s*\)/u.exec(source.slice(callbackEnd, callbackEnd + 500))?.[1]?.replace(/\s+/gu, " ").trim();
}

function findReactUseEffectCallbacks(source: string): Array<FunctionDefinition & { dependencies: string | undefined }> {
  const effects: Array<FunctionDefinition & { dependencies: string | undefined }> = [];
  const effectPattern = /\bReact\.useEffect\s*\(/gu;

  for (const match of source.matchAll(effectPattern)) {
    const arrowIndex = source.indexOf("=>", match.index + match[0].length);
    if (arrowIndex < 0) {
      continue;
    }
    const openBraceIndex = source.indexOf("{", arrowIndex);
    if (openBraceIndex < 0) {
      continue;
    }
    const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
    if (closeBraceIndex === undefined) {
      continue;
    }

    effects.push({
      body: source.slice(openBraceIndex + 1, closeBraceIndex),
      dependencies: reactHookDependencyListAfter(source, closeBraceIndex + 1),
      end: closeBraceIndex + 1,
      isAsync: false,
      name: "React.useEffect",
      start: match.index
    });
  }

  return effects;
}

function hasJsxElement(source: string, elementName: string): boolean {
  return new RegExp(`<${escapeRegExp(elementName)}\\b`, "u").test(stripComments(source));
}

function traceTabPanelRendersTraceUi(source: string): boolean {
  return /<TabsContent\b[^>]*\bvalue="trace"[\s\S]{0,1200}(?:<AgentTracePanel\b|\bdata-testid\s*=\s*["']maya-agent-process-map["'])/u.test(
    stripComments(source)
  );
}

function queryScenarioFlowAssertsDenseTraceRowsFromTraceTab(source: string): boolean {
  const runner = findFunctionDefinition(stripComments(source), "runRealMayaQueryScenarios");
  if (runner === undefined) {
    return false;
  }

  const body = runner.body;
  const citedAnswerIndex = body.indexOf("await assertRenderedCitedAnswerMatchesBackend(page, scenario, queryResult.backendResponse);");
  const processMapIndex = body.indexOf("await assertAgentProcessMapAfterQuery(page, queryResult);");
  const directTracePanelIndex = body.indexOf("await assertRenderedAgentTracePanelMatchesBackend(page, queryResult);");
  const traceRowCalls = [...body.matchAll(/await\s+assertRenderedTraceRowsMatchBackend\(page,\s*queryResult\.backendResponse\.trace\);/gu)];
  const [traceRowCall] = traceRowCalls;
  const traceRowIndex = traceRowCall?.index ?? -1;

  return (
    citedAnswerIndex > -1 &&
    processMapIndex > citedAnswerIndex &&
    traceRowCalls.length === 1 &&
    traceRowIndex > processMapIndex &&
    directTracePanelIndex === -1
  );
}

function missingTraceDataDrivenRendering(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];
  if (!/\b(?:response\.trace|traceEvents|processNodes)\.map\b/u.test(stripped)) {
    missing.push("trace panel does not map backend traceEvents/processNodes/response.trace");
  }
  if (!/\b(?:event|node)\.agentName\b/u.test(stripped)) {
    missing.push("trace row does not render backend event/node agentName");
  }
  if (!/\b(?:event|node)\.hook\b/u.test(stripped)) {
    missing.push("trace row does not render backend event/node hook");
  }
  if (!/\b(?:event|node)\.phase\b/u.test(stripped)) {
    missing.push("trace row does not render backend event/node phase");
  }
  if (!/\b(?:event|node)\.recordIds\b/u.test(stripped)) {
    missing.push("trace row does not render backend event/node recordIds");
  }
  if (!/\b(?:event|node)\.deterministicBasis\b/u.test(stripped)) {
    missing.push("trace row does not render backend event/node deterministicBasis");
  }

  return missing;
}

function missingQueryDockTracePanelRendering(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];
  if (!hasJsxElement(source, "AgentTracePanel")) {
    missing.push("query dock does not render AgentTracePanel");
  }
  if (!/<AgentTracePanel\b[^>]*\bresponse=\{snapshot\}/u.test(stripped)) {
    missing.push("query dock AgentTracePanel is not tied to the concrete backend query snapshot");
  }

  return missing;
}

function missingProcessNodeMatcherPriorityRequirements(e2eSource: string): string[] {
  const stripped = stripComments(e2eSource);
  const missing: string[] = [];
  const matcher = findFunctionDefinition(stripped, "findRenderedAgentProcessNodeForTraceEvent");
  if (matcher === undefined) {
    return ["process node matcher is missing"];
  }

  if (
    !/\bconst\s+exactAttributeMatches\s*=[\s\S]{0,900}\bprocessNodeMatchesTraceLabel\s*\(\s*node\s*,\s*event\s*\)[\s\S]{0,900}\bprocessNodeMatchesAgentName\s*\(\s*node\s*,\s*event\s*\)[\s\S]{0,900}\bprocessNodeMatchesHook\s*\(\s*node\s*,\s*event\s*\)/u.test(
      matcher.body
    )
  ) {
    missing.push("matcher does not build exact traceLabel + agentName + hook matches before fallback");
  }
  if (
    !/\bexactAttributeMatches\.find\s*\(\s*\(\s*node\s*\)\s*=>\s*renderedProcessNodeMatchesPhase\s*\(\s*node\s*,\s*event\s*\)\s*\)\s*\?\?\s*exactAttributeMatches\[0\]/u.test(
      matcher.body
    )
  ) {
    missing.push("matcher does not prefer exact attribute matches with phase before weaker fallbacks");
  }
  if (!/\blabelAndAgentMatches\.find\s*\(\s*\(\s*node\s*\)\s*=>\s*renderedProcessNodeMatchesPhase\s*\(\s*node\s*,\s*event\s*\)\s*\)/u.test(matcher.body)) {
    missing.push("matcher does not use phase to disambiguate exact label + agent matches");
  }

  const phaseMatcher = findFunctionDefinition(stripped, "renderedProcessNodeMatchesPhase");
  if (phaseMatcher === undefined) {
    missing.push("matcher is missing phase disambiguation helper");
  } else {
    if (!/\bnode\.phase\b/u.test(phaseMatcher.body)) {
      missing.push("phase helper does not read node phase attribute");
    }
    if (!/\bnode\.text\b/u.test(phaseMatcher.body)) {
      missing.push("phase helper does not fall back to visible node text");
    }
  }

  const reader = findFunctionDefinition(stripped, "readRenderedAgentProcessNodes");
  if (reader === undefined || !/\bphase\s*:\s*node\.getAttribute\s*\(\s*["']data-phase["']\s*\)/u.test(reader.body)) {
    missing.push("rendered process node reader does not capture data-phase when the UI exposes it");
  }

  const duplicateSelfTest = findFunctionDefinition(stripped, "assertAgentTraceNodeMatchingDisambiguatesDuplicateLabels");
  if (
    duplicateSelfTest === undefined ||
    !/Forensics Supervisor/u.test(duplicateSelfTest.body) ||
    !/Scope accepted/u.test(duplicateSelfTest.body) ||
    !/scope_accept/u.test(duplicateSelfTest.body) ||
    !/scope_resolution/u.test(duplicateSelfTest.body)
  ) {
    missing.push("duplicate-label self-test does not cover exact agent/hook/phase process-node selection");
  }

  return missing;
}

function missingCitedAnswerBackendOrderRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];
  if (!/\bconst\s+citationRows\s*=\s*response\.citations\.map\s*\(/u.test(stripped)) {
    missing.push("cited answer rows are not derived directly from backend response.citations");
  }
  if (!/\bcitationRows\.map\s*\(/u.test(stripped)) {
    missing.push("cited answer does not render citationRows in backend order");
  }
  if (/\borderedCitationRows\b/u.test(stripped) || /\bcitationRows\b[\s\S]{0,180}\.sort\s*\(/u.test(stripped)) {
    missing.push("cited answer sorts citations instead of preserving backend response.citations order");
  }

  return missing;
}

function missingCaseWorkspaceQueryResponseRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const missing: string[] = [];
  if (!/\bQueryEvidenceResponse\b/u.test(stripped)) {
    missing.push("case workspace does not type parent query state as QueryEvidenceResponse");
  }
  if (!/\bconst\s*\[\s*queryResponse\s*,\s*setQueryResponse\s*\]\s*=\s*React\.useState\s*<\s*QueryEvidenceResponse\s*\|\s*undefined\s*>\s*\(\s*\)/u.test(stripped)) {
    missing.push("case workspace does not retain latest QueryEvidenceResponse in local state");
  }
  if (!/\bsetQueryResponse\s*\(\s*undefined\s*\)/u.test(stripped)) {
    missing.push("case workspace does not reset query response when selected evidence identity changes");
  }
  if (!/<AgentTracePanel\b[\s\S]{0,520}\bresponse=\{queryResponse\}/u.test(stripped)) {
    missing.push("case trace tab does not receive the latest QueryEvidenceResponse");
  }
  if (!/<QueryEvidenceDock\b[\s\S]{0,900}\bonResponse=\{setQueryResponse\}/u.test(stripped)) {
    missing.push("case workspace does not wire QueryEvidenceDock onResponse to set query state");
  }
  if (/onResponse=\{\s*\(\s*\)\s*=>\s*undefined\s*\}/u.test(stripped)) {
    missing.push("case workspace still drops query responses through a no-op onResponse callback");
  }

  return missing;
}

function findSourceResolverDefinitions(source: string): FunctionDefinition[] {
  const stripped = stripComments(source);
  const resolverNames = new Set<string>();
  const resolverPattern =
    /\b(?:function|const|let)\s+((?:resolve|derive|normalize)\w*(?:RetrievalSource|SourceKind|SourceLabel|SourceHandling|SourceTone))\b/gu;
  for (const match of stripped.matchAll(resolverPattern)) {
    resolverNames.add(match[1] ?? "");
  }

  return [...resolverNames]
    .map((resolverName) => findFunctionDefinition(stripped, resolverName))
    .filter((definition): definition is FunctionDefinition => definition !== undefined);
}

function extractProcessNodeRetrievalContexts(source: string): string[] {
  const stripped = stripComments(source);
  const resolverDefinitions = findSourceResolverDefinitions(stripped);
  const contexts: string[] = [];
  const processMapPattern = /\b(?:response\.trace|traceEvents|processNodes|sourceNodes)\.map\s*\(\s*\(?\s*(event|node)\b/gu;

  for (const match of stripped.matchAll(processMapPattern)) {
    const context = stripped.slice(match.index, match.index + 3_600);
    if (!/\bdata-testid\s*=\s*(?:"maya-agent-process-node"|'maya-agent-process-node'|\{\s*["']maya-agent-process-node["']\s*\})/u.test(context)) {
      continue;
    }

    const expandedContext = [
      context,
      ...resolverDefinitions
        .filter((definition) => new RegExp(`\\b${escapeRegExp(definition.name)}\\s*\\(\\s*(?:event|node)\\s*\\)`, "u").test(context))
        .map((definition) => definition.body)
    ].join("\n");
    contexts.push(expandedContext);
  }

  return contexts;
}

function contextHasEventSourceField(context: string): boolean {
  return /\b(?:event|node)\.(?:sourceKind|toolName|retrievalSource)\b/u.test(context);
}

function contextHandlesSapODataSource(context: string): boolean {
  return (
    contextHasEventSourceField(context) &&
    /\b(?:(?:event|node)\.(?:sourceKind|retrievalSource)\s*={0,2}\s*["']sap[-_]odata["']|(?:event|node)\.toolName[^;\n]*sap|SAP OData|sap[-_]odata)\b/iu.test(
      context
    )
  );
}

function contextHandlesSupabaseOrSourceBackedSource(context: string): boolean {
  return (
    contextHasEventSourceField(context) &&
    /\b(?:(?:event|node)\.(?:sourceKind|retrievalSource)\s*={0,2}\s*["']supabase["']|(?:event|node)\.toolName[^;\n]*supabase|Supabase|supabase|source-backed|sourceBacked)\b/u.test(
      context
    )
  );
}

function missingTraceSapSupabaseRetrievalRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const processNodeContexts = extractProcessNodeRetrievalContexts(stripped);
  const missing: string[] = [];

  if (processNodeContexts.length === 0) {
    missing.push("process-node rendering is not anchored to backend trace/source nodes");
  }
  if (!processNodeContexts.some((context) => contextHasEventSourceField(context))) {
    missing.push("process node context missing event/node sourceKind, toolName, or retrievalSource handling");
  }
  if (
    !processNodeContexts.some((context) =>
      /\bdata-(?:retrieval-source|source-kind)\s*=\s*\{[^}]*\b(?:(?:event|node)\.(?:sourceKind|toolName|retrievalSource)|(?:resolve|derive|normalize)\w*(?:SourceKind|RetrievalSource|SourceLabel)\s*\(\s*(?:event|node)\s*\))/u.test(
        context
      )
    )
  ) {
    missing.push("process node missing data-retrieval-source/data-source-kind derived from event/node source metadata");
  }
  if (!processNodeContexts.some((context) => contextHandlesSapODataSource(context))) {
    missing.push("process node source resolver does not explicitly branch SAP OData from event/node source metadata");
  }
  if (!processNodeContexts.some((context) => contextHandlesSupabaseOrSourceBackedSource(context))) {
    missing.push("process node source resolver does not explicitly branch Supabase/source-backed retrieval from event/node source metadata");
  }

  return missing;
}

function extractAgentProcessNodeContexts(source: string): string[] {
  const stripped = stripComments(source);
  const contexts: string[] = [];
  const processNodePattern =
    /\bdata-testid\s*=\s*(?:"maya-agent-process-node"|'maya-agent-process-node'|\{\s*["']maya-agent-process-node["']\s*\})/gu;

  for (const match of stripped.matchAll(processNodePattern)) {
    const index = match.index;
    contexts.push(stripped.slice(Math.max(0, index - 1_200), Math.min(stripped.length, index + 2_400)));
  }

  return contexts;
}

function contextHasPattern(contexts: readonly string[], pattern: RegExp): boolean {
  return contexts.some((context) => {
    pattern.lastIndex = 0;
    const matched = pattern.test(context);
    pattern.lastIndex = 0;
    return matched;
  });
}

function missingAgentProcessNodeRequirements(
  source: string,
  processName: string,
  requirements: readonly LabeledPattern[]
): string[] {
  const contexts = extractAgentProcessNodeContexts(source);
  const missing: string[] = [];

  if (contexts.length === 0) {
    missing.push(`${processName}: missing maya-agent-process-node rendering context`);
    return missing;
  }

  for (const { label, pattern } of requirements) {
    if (!contextHasPattern(contexts, pattern)) {
      missing.push(`${processName}: ${label}`);
    }
  }

  return missing;
}

function missingSelectedEvidenceNodeRecordIdRequirements(source: string): string[] {
  const contexts = extractAgentProcessNodeContexts(source);
  const missing: string[] = [];

  if (contexts.length === 0) {
    missing.push("selected evidence node: missing maya-agent-process-node rendering context");
    return missing;
  }

  const selectedEvidenceContexts = contexts.filter((context) =>
    /\b(?:selected(?:Line|Evidence)?|evidencePack|Selected line|selected evidence|selected-line|maya-query-selected-line)\b/iu.test(
      context
    )
  );
  if (selectedEvidenceContexts.length === 0) {
    missing.push("selected evidence node: missing selected-line/evidence process-node identity");
    return missing;
  }
  if (
    !contextHasPattern(
      selectedEvidenceContexts,
      /\b(?:(?:event|node|processNode|selectedEvidenceNode|selected)\.recordIds|evidencePack\.recordIds|recordIds\.map)\b/u
    )
  ) {
    missing.push("selected evidence node: missing explicit backend recordIds rendering");
  }

  return missing;
}

function missingInvestigatorTraceRequirements(source: string): string[] {
  return missingAgentProcessNodeRequirements(source, "investigator trace node", [
    {
      label: "missing backend agentName binding for Forensics Investigator proof",
      pattern: /\b(?:event|node|processNode)\.agentName\b/u
    }
  ]);
}

function missingRecoveryTraceRequirements(source: string): string[] {
  return missingAgentProcessNodeRequirements(source, "recovery trace node", [
    {
      label: "missing backend nextAgentName binding for Recovery Drafter handoff proof",
      pattern: /\b(?:event|node|processNode)\.nextAgentName\b/u
    }
  ]);
}

function missingCitationTraceRequirements(source: string): string[] {
  return missingAgentProcessNodeRequirements(source, "citation trace node", [
    {
      label: "missing citation/cited-record guard node proof",
      pattern: /\b(?:citation|citations|cited)\b/iu
    }
  ]);
}

function missingBasisTraceRequirements(source: string): string[] {
  return missingAgentProcessNodeRequirements(source, "basis trace node", [
    {
      label: "missing deterministicBasis rendering from backend trace node",
      pattern: /\b(?:(?:event|node|processNode)\.deterministicBasis|deterministicBasis)\b/u
    }
  ]);
}

function findMatchingBrace(source: string, openBraceIndex: number): number | undefined {
  let depth = 0;
  let index = openBraceIndex;
  let state: "block-comment" | "code" | "double" | "line-comment" | "single" | "template" = "code";

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        index += 2;
        state = "code";
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
        state = "code";
      }
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      index += 2;
      state = "line-comment";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      state = "block-comment";
      continue;
    }
    if (char === "'") {
      index += 1;
      state = "single";
      continue;
    }
    if (char === '"') {
      index += 1;
      state = "double";
      continue;
    }
    if (char === "`") {
      index += 1;
      state = "template";
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }

  return undefined;
}

function findFunctionDefinition(source: string, functionName: string): FunctionDefinition | undefined {
  const escapedName = escapeRegExp(functionName);
  const patterns = [
    {
      pattern: new RegExp(`\\b(async\\s+)?function\\s+${escapedName}(?:<[^>]+>)?\\s*\\(`, "u"),
      asyncGroup: 1
    },
    {
      pattern: new RegExp(`\\b(?:const|let)\\s+${escapedName}\\s*=\\s*(async\\s*)?function(?:<[^>]+>)?\\b[^=]*`, "u"),
      asyncGroup: 1
    },
    {
      pattern: new RegExp(
        `\\b(?:const|let)\\s+${escapedName}\\s*=\\s*(async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`,
        "u"
      ),
      asyncGroup: 1
    }
  ];

  for (const { asyncGroup, pattern } of patterns) {
    const match = pattern.exec(source);
    if (match === null) {
      continue;
    }

    const openBraceIndex = source.indexOf("{", match.index + match[0].length);
    if (openBraceIndex < 0) {
      continue;
    }
    const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
    if (closeBraceIndex === undefined) {
      continue;
    }

    return {
      body: source.slice(openBraceIndex + 1, closeBraceIndex),
      end: closeBraceIndex + 1,
      isAsync: match[asyncGroup] !== undefined,
      name: functionName,
      start: match.index
    };
  }

  return undefined;
}

function assertionPattern(): RegExp {
  return new RegExp(assertOrExpectPatternSource, "u");
}

function bodyHasAssertion(body: string): boolean {
  return assertionPattern().test(stripComments(body));
}

function bodyReferencesBackendReadModel(body: string): boolean {
  return /\b(?:forensicsModel|connectorsModel|backendResponse|appResponse|queryResult|scenario|sourceTiles|worklist|evidencePack|kpiStrip|multimodalDock|backendTrace|approvalActions|auditState|actionInbox|draft)\b|\bdetail\.(?:selected|workItem|lineId)\b/u.test(
    stripComments(body)
  );
}

function bodyReferencesExplicitFailClosedState(body: string): boolean {
  return /\b(?:blocked|contract gap|contractGap|error|fail-closed|failClosed|missingSource|unavailable)\b/iu.test(stripComments(body));
}

function findClassOrObjectMethodDefinition(source: string, methodName: string): FunctionDefinition | undefined {
  const stripped = stripComments(source);
  const methodPattern = new RegExp(`\\b(async\\s+)?${escapeRegExp(methodName)}(?:<[^>]+>)?\\s*\\(`, "gu");

  for (const match of stripped.matchAll(methodPattern)) {
    const matchIndex = match.index;
    const previousChar = stripped[matchIndex - 1] ?? "";
    if (previousChar === "." || /[\w$]/u.test(previousChar)) {
      continue;
    }

    const openBraceIndex = stripped.indexOf("{", matchIndex + match[0].length);
    if (openBraceIndex < 0) {
      continue;
    }
    const closeBraceIndex = findMatchingBrace(stripped, openBraceIndex);
    if (closeBraceIndex === undefined) {
      continue;
    }

    return {
      body: stripped.slice(openBraceIndex + 1, closeBraceIndex),
      end: closeBraceIndex + 1,
      isAsync: match[1] !== undefined,
      name: methodName,
      start: matchIndex
    };
  }

  return undefined;
}

function bodyValidatesResponseStatusAndJson(body: string): boolean {
  const stripped = stripComments(body);
  return /\b(?:response\.ok(?:\(\))?|response\.status(?:\(\))?|call\.status)\b/u.test(stripped) && /\b(?:JSON\.parse|\.json\s*\()/u.test(stripped);
}

function bodyUsesHttpAcquisition(body: string): boolean {
  return /\b(?:fetch\s*\(|page\.waitForResponse\s*\(|recorder\.waitForJsonResponse\s*\()/u.test(stripComments(body));
}

function splitTopLevelCommaList(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let index = 0;
  let state: "code" | "double" | "single" | "template" = "code";

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "single" || state === "double" || state === "template") {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
        state = "code";
      }
      index += 1;
      continue;
    }

    if (char === "'") {
      state = "single";
    } else if (char === '"') {
      state = "double";
    } else if (char === "`") {
      state = "template";
    } else if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }

    if (char === "\\" && next.length > 0) {
      index += 2;
    } else {
      index += 1;
    }
  }

  const finalPart = source.slice(start).trim();
  if (finalPart.length > 0) {
    parts.push(finalPart);
  }

  return parts;
}

function bindingName(binding: string): string | undefined {
  return /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)\b/u.exec(binding)?.[1];
}

function fetchRequiredJsonCallPatternSource(modelType: string, endpoint: string): string {
  return String.raw`\bfetchRequiredJson\s*<\s*${escapeRegExp(modelType)}\s*>\s*\(\s*apiServer\.url\s*,\s*["']${escapeRegExp(endpoint)}["']\s*,\s*["']direct-api["']\s*\)`;
}

function modelIsIndividuallyAcquiredThroughFetchRequiredJson(
  source: string,
  variableName: string,
  modelType: string,
  endpoint: string
): boolean {
  const fetchCallPattern = new RegExp(fetchRequiredJsonCallPatternSource(modelType, endpoint), "u");
  const directAssignmentPattern = new RegExp(
    String.raw`\bconst\s+${escapeRegExp(variableName)}\s*(?::[^=\n]+)?=\s*await\s+${fetchRequiredJsonCallPatternSource(modelType, endpoint)}`,
    "u"
  );
  if (directAssignmentPattern.test(source)) {
    return true;
  }

  const promiseAllPattern = /\bconst\s*\[\s*([^\]]+)\]\s*=\s*await\s+Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/gu;
  for (const match of source.matchAll(promiseAllPattern)) {
    const bindings = splitTopLevelCommaList(match[1] ?? "").map((binding) => bindingName(binding));
    const initializers = splitTopLevelCommaList(match[2] ?? "");
    const bindingIndex = bindings.findIndex((name) => name === variableName);
    const initializer = bindingIndex >= 0 ? initializers[bindingIndex] : undefined;
    if (initializer !== undefined && fetchCallPattern.test(initializer)) {
      return true;
    }
  }

  return false;
}

function extractE2eBackendAcquisitionBlock(source: string): string | undefined {
  const mainDefinition = findFunctionDefinition(source, "main");
  if (mainDefinition === undefined) {
    return undefined;
  }

  const startMatch = /\bapiServer\s*=\s*await\s+ensureRealApi\s*\(\s*\)\s*;/u.exec(mainDefinition.body);
  if (startMatch === null) {
    return undefined;
  }

  const acquisitionTail = mainDefinition.body.slice(startMatch.index);
  const endMatch = /\bbrowser\s*=\s*await\s+chromium\.launch\b/u.exec(acquisitionTail);
  return acquisitionTail.slice(0, endMatch?.index ?? acquisitionTail.length);
}

function missingE2eBackendAcquisitionRequirements(e2eSource: string): string[] {
  const stripped = stripComments(e2eSource);
  const missing: string[] = [];
  const fetchRequiredJson = findFunctionDefinition(stripped, "fetchRequiredJson");
  const waitForAppJsonResponse = findFunctionDefinition(stripped, "waitForAppJsonResponse");
  const readRequiredJsonResponse = findFunctionDefinition(stripped, "readRequiredJsonResponse");
  const waitForJsonResponse = findClassOrObjectMethodDefinition(stripped, "waitForJsonResponse");
  const acquisitionBlock = extractE2eBackendAcquisitionBlock(stripped);

  if (fetchRequiredJson === undefined || !bodyUsesHttpAcquisition(fetchRequiredJson.body) || !bodyValidatesResponseStatusAndJson(fetchRequiredJson.body)) {
    missing.push("E2E missing fetchRequiredJson backend loader with fetch, response.ok/status, and JSON parsing");
  }
  if (waitForAppJsonResponse === undefined || !/\bpage\.waitForResponse\s*\(/u.test(waitForAppJsonResponse.body)) {
    missing.push("E2E missing waitForAppJsonResponse/page.waitForResponse browser acquisition path");
  }
  if (readRequiredJsonResponse === undefined || !bodyValidatesResponseStatusAndJson(readRequiredJsonResponse.body)) {
    missing.push("E2E missing readRequiredJsonResponse status validation plus JSON parsing");
  }
  if (waitForJsonResponse === undefined || !bodyValidatesResponseStatusAndJson(waitForJsonResponse.body)) {
    missing.push("E2E missing apiServer.recorder.waitForJsonResponse status validation plus JSON parsing");
  }
  if (acquisitionBlock === undefined) {
    missing.push("E2E backend acquisition block is not anchored between ensureRealApi and browser launch");
  } else {
    if (
      !modelIsIndividuallyAcquiredThroughFetchRequiredJson(
        acquisitionBlock,
        "forensicsModel",
        "ForensicsRealBackendModel",
        "/forensics"
      )
    ) {
      missing.push("E2E forensicsModel is not individually acquired from /forensics via fetchRequiredJson<ForensicsRealBackendModel>");
    }
    if (
      !modelIsIndividuallyAcquiredThroughFetchRequiredJson(
        acquisitionBlock,
        "connectorsModel",
        "ConnectorRealBackendModel",
        "/connectors"
      )
    ) {
      missing.push("E2E connectorsModel is not individually acquired from /connectors via fetchRequiredJson<ConnectorRealBackendModel>");
    }
    for (const assignmentLine of forbiddenLocalBackendReadModelAssignments(acquisitionBlock)) {
      missing.push(`E2E acquisition block uses forbidden local backend/read-model assignment ${assignmentLine}`);
    }
  }
  if (!/\bconst\s+detail\s*=\s*await\s+readRequiredJsonResponse\b/u.test(stripped)) {
    missing.push("E2E detail expected read model is not acquired through readRequiredJsonResponse");
  }
  if (!/\bconst\s+appResponse\s*=\s*await\s+readRequiredJsonResponse\b/u.test(stripped)) {
    missing.push("E2E app query expected response is not acquired through readRequiredJsonResponse");
  }
  if (!/\bconst\s+backendResponse\s*=\s*await\s+apiServer\.recorder\.waitForJsonResponse\b/u.test(stripped)) {
    missing.push("E2E backend query expected response is not acquired through apiServer.recorder.waitForJsonResponse");
  }

  return missing;
}

function sourceLineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function sourceFragment(source: string, index: number, length: number): string {
  return source.slice(index, index + length).replace(/\s+/gu, " ").trim();
}

function matchingSourceFragments(source: string, pattern: RegExp, path: string): string[] {
  const matches: string[] = [];
  pattern.lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    matches.push(`${path}:${String(sourceLineNumberAt(source, index))} ${sourceFragment(source, index, 220)}`);
  }
  pattern.lastIndex = 0;

  return matches;
}

function forbiddenLocalBackendReadModelAssignments(body: string): string[] {
  const backendReadModelNamePatternSource =
    String.raw`(?:backendResponse|appResponse|forensicsModel|connectorsModel|queryResult|scenario|readModel|model|sourceTiles|worklist|evidencePack|kpiStrip|multimodalDock|backendTrace|approvalActions|auditState|actionInbox|draft)`;
  const localAssignmentPattern =
    new RegExp(String.raw`\b(?:const|let|var)\s+${backendReadModelNamePatternSource}\b(?:\s*:\s*[^=\n]+)?\s*=\s*(?:\{|\[)`, "giu");
  const localReassignmentPattern = new RegExp(
    String.raw`\b${backendReadModelNamePatternSource}\b\s*=\s*(?:\{|\[|(?:fake|mock|dummy|sample|fixture)[A-Za-z_$][\w$]*)`,
    "giu"
  );
  const localDestructuredAssignmentPattern = new RegExp(
    String.raw`\b(?:const|let|var)\s*(?:\[[\s\S]{0,500}\b${backendReadModelNamePatternSource}\b[\s\S]{0,500}\]|\{[\s\S]{0,500}\b${backendReadModelNamePatternSource}\b[\s\S]{0,500}\})\s*(?::\s*[^=]+)?=\s*(?!await\s+Promise\.all\s*\()\s*(?:\{|\[|(?:fake|mock|dummy|sample|fixture)[A-Za-z_$][\w$]*)`,
    "giu"
  );

  return [
    ...matchingLines([{ path: "assertion-helper", source: body }], localAssignmentPattern).map((line) =>
      line.replace("assertion-helper:", "")
    ),
    ...matchingLines([{ path: "assertion-helper", source: body }], localReassignmentPattern).map((line) =>
      line.replace("assertion-helper:", "")
    ),
    ...matchingSourceFragments(body, localDestructuredAssignmentPattern, "assertion-helper").map((line) =>
      line.replace("assertion-helper:", "")
    )
  ];
}

function renderedBackendAssertionPattern(label: string, backendPatternSource: string, renderedPatternSource = renderedValuePatternSource): LabeledPattern {
  return {
    label,
    pattern: new RegExp(
      [
        `${renderedPatternSource}[\\s\\S]{0,2400}${assertOrExpectPatternSource}[\\s\\S]{0,2400}${backendPatternSource}`,
        `${backendPatternSource}[\\s\\S]{0,2400}${renderedPatternSource}[\\s\\S]{0,2400}${assertOrExpectPatternSource}`,
        `${backendPatternSource}[\\s\\S]{0,2400}${assertOrExpectPatternSource}[\\s\\S]{0,2400}${renderedPatternSource}`
      ].join("|"),
      "iu"
    )
  };
}

function helperSpecificRequiredBodyPatterns(helperName: string): readonly LabeledPattern[] {
  switch (helperName) {
    case "assertRenderedPromptChipsMatchBackend":
      return [
        renderedBackendAssertionPattern(
          "rendered prompt chips asserted against backend/read-model prompt collection",
          String.raw`\b(?:forensicsModel\.multimodalDock|forensicsModel\.queryPromptChips|queryResult|backendResponse|appResponse|promptChips|queryPromptChips|prebuiltPrompts|promptSuggestions|suggestedQueries|querySuggestions)\b`
        )
      ];
    case "assertRenderedConversationTurnsMatchBackend":
      return [
        renderedBackendAssertionPattern(
          "rendered conversation turns asserted against scenario and backend query response",
          String.raw`\b(?:scenario\.(?:question|operatorIntent|id)|queryResult\.(?:backendResponse|appResponse|scenario)|backendResponse\.(?:answer|citations|deterministicBasis)|appResponse\.(?:answer|citations|deterministicBasis))\b`
        )
      ];
    case "assertAgentProcessMapBeforeQuery":
      return [
        renderedBackendAssertionPattern(
          "pre-query process nodes asserted against forensics/connectors read models",
          String.raw`\b(?:forensicsModel\.(?:worklist|selected|multimodalDock)|connectorsModel\.sourceTiles|sourceTiles|worklist|detail\.(?:selected|workItem|lineId))\b`
        )
      ];
    case "assertAgentProcessMapAfterQuery":
      return [
        renderedBackendAssertionPattern(
          "post-query process nodes asserted against backend/app trace rows",
          String.raw`\b(?:queryResult\.(?:backendResponse|appResponse)|backendResponse\.trace|appResponse\.trace|backendTrace)\b`
        )
      ];
    case "assertReturnToWorklistRestoresWorklist":
      return [
        renderedBackendAssertionPattern(
          "returned worklist rows asserted against backend worklist",
          String.raw`\b(?:forensicsModel\.worklist|worklist|detail\.lineId)\b`
        )
      ];
    case "assertRenderedKpiStripMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "KPI strip rendered values asserted against forensicsModel.kpiStrip",
          String.raw`\b(?:forensicsModel\.kpiStrip|kpiStrip)\b`
        )
      ];
    case "assertRenderedSourceReadinessMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "source readiness rendered tiles asserted against connectorsModel.sourceTiles",
          String.raw`\b(?:connectorsModel\.sourceTiles|model\.sourceTiles|sourceTiles)\b`
        )
      ];
    case "assertRenderedWorklistTableMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "worklist table rendered rows asserted against forensicsModel.worklist",
          String.raw`\b(?:forensicsModel\.worklist|worklist)\b`
        )
      ];
    case "assertRenderedRecommendedActionCellMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "recommended action rendered cells asserted against backend worklist/actions",
          String.raw`\b(?:forensicsModel\.(?:worklist|actionInbox|selected)|worklist|actionInbox|approvalActions|recommendedAction)\b`
        )
      ];
    case "assertRenderedEvidenceDossierMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "evidence dossier rendered records asserted against backend evidencePack",
          String.raw`\b(?:detail\.selected\.evidencePack|forensicsModel\.selected\.evidencePack|evidencePack)\b`
        )
      ];
    case "assertRenderedQueryDockMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "query dock rendered scope asserted against detail/read-model evidence and prompts",
          String.raw`\b(?:detail\.selected\.evidencePack|forensicsModel\.(?:multimodalDock|queryPromptChips)|evidencePack|promptChips|queryPromptChips)\b`
        )
      ];
    case "assertVisibleSelectedEvidenceScope":
      return [
        renderedBackendAssertionPattern(
          "visible selected evidence scope asserted against detail/read-model evidence",
          String.raw`\bdetail\.selected\.(?:lineId|evidencePack(?:\.recordIds)?)\b`
        )
      ];
    case "assertRenderedAgentTracePanelMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "agent trace panel rendered rows asserted against backend/app trace",
          String.raw`\b(?:queryResult\.(?:backendResponse|appResponse)|backendResponse\.trace|appResponse\.trace|backendTrace)\b`
        )
      ];
    case "assertRenderedCitedAnswerMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "cited answer rendered answer/basis/citations asserted against scenario and backendResponse",
          String.raw`\b(?:scenario\.(?:question|id)|backendResponse\.(?:answer|deterministicBasis|citations))\b`
        )
      ];
    case "assertRenderedRecoveryDraftMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "recovery draft rendered fields asserted against backend draft/approval actions",
          String.raw`\b(?:detail\.selected|forensicsModel\.selected|draft|approvalActions|actionInbox|evidencePack)\b`
        )
      ];
    case "assertRenderedApprovalGateMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "approval gate rendered fields asserted against backend approval actions",
          String.raw`\b(?:detail\.selected|forensicsModel\.selected|approvalActions|actionInbox|draft)\b`
        )
      ];
    case "assertRenderedAuditConfirmationMatchesBackend":
      return [
        renderedBackendAssertionPattern(
          "audit confirmation rendered fields asserted against backend audit state",
          String.raw`\b(?:auditState|detail\.selected|forensicsModel\.selected|approvalActions|actionInbox)\b`
        )
      ];
    default:
      throw new Error(`Missing helper-specific backend/rendered comparison contract for ${helperName}.`);
  }
}

function hasHelperInvocation(source: string, definition: FunctionDefinition): boolean {
  const withoutDefinition = `${source.slice(0, definition.start)}\n${source.slice(definition.end)}`;
  if (!definition.isAsync) {
    return new RegExp(`\\b${escapeRegExp(definition.name)}\\s*\\(`, "u").test(withoutDefinition);
  }

  return hasAwaitedOrReturnedAsyncHelperInvocation(withoutDefinition, definition.name);
}

function hasAwaitedOrReturnedAsyncHelperInvocation(source: string, helperName: string): boolean {
  const escapedName = escapeRegExp(helperName);
  if (new RegExp(`\\b(?:await\\s+|return\\s+(?:await\\s+)?)${escapedName}\\s*\\(`, "u").test(source)) {
    return true;
  }

  return hasAwaitedPromiseAllHelperInvocation(source, helperName);
}

function hasAwaitedPromiseAllHelperInvocation(source: string, helperName: string): boolean {
  const callPattern = new RegExp(`\\b${escapeRegExp(helperName)}\\s*\\(`, "gu");
  for (const match of source.matchAll(callPattern)) {
    const callIndex = match.index;
    const prefix = source.slice(Math.max(0, callIndex - 2_400), callIndex);
    const promiseAllStarts = [...prefix.matchAll(/\bawait\s+Promise\.all\s*\(\s*\[/gu)];
    const lastPromiseAllStart = promiseAllStarts[promiseAllStarts.length - 1];
    if (lastPromiseAllStart === undefined) {
      continue;
    }
    const betweenPromiseAllAndCall = prefix.slice(lastPromiseAllStart.index);
    if (!/\]\s*\)/u.test(betweenPromiseAllAndCall)) {
      return true;
    }
  }

  return false;
}

function namedAssertionHelpers(source: string): FunctionDefinition[] {
  const helperNames = new Set<string>();
  const helperPattern = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gu;
  for (const match of source.matchAll(helperPattern)) {
    helperNames.add(match[1] ?? "");
  }
  const arrowHelperPattern = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gu;
  for (const match of source.matchAll(arrowHelperPattern)) {
    helperNames.add(match[1] ?? "");
  }

  return [...helperNames]
    .map((helperName) => findFunctionDefinition(source, helperName))
    .filter((definition): definition is FunctionDefinition => definition !== undefined && bodyHasAssertion(definition.body));
}

function e2eHasMeaningfulCoverage(e2eSource: string, hook: string): boolean {
  const stripped = stripComments(e2eSource);
  const escapedHook = escapeRegExp(hook);
  const hookPattern = new RegExp(escapedHook, "gu");
  const assertionHelpers = namedAssertionHelpers(stripped);

  for (const match of stripped.matchAll(hookPattern)) {
    const hookIndex = match.index;
    const nearbySource = stripped.slice(Math.max(0, hookIndex - 260), hookIndex + 360);
    if (assertionPattern().test(nearbySource)) {
      return true;
    }
    if (
      assertionHelpers.some((helper) =>
        new RegExp(`\\b${escapeRegExp(helper.name)}\\s*\\([\\s\\S]{0,360}${escapedHook}`, "u").test(nearbySource)
      )
    ) {
      return true;
    }
  }

  return false;
}

function missingE2eHelperContracts(e2eSource: string, requirements: readonly E2eHelperRequirement[]): string[] {
  const missing: string[] = [];
  const stripped = stripComments(e2eSource);

  for (const requirement of requirements) {
    const definition = findFunctionDefinition(stripped, requirement.helperName);
    if (definition === undefined) {
      missing.push(`${requirement.helperName}:missing definition`);
      continue;
    }
    if (!hasHelperInvocation(stripped, definition)) {
      missing.push(`${requirement.helperName}:missing invocation`);
    }
    if (!bodyHasAssertion(definition.body)) {
      missing.push(`${requirement.helperName}:missing assert/expect`);
    }
    if (
      !bodyReferencesBackendReadModel(definition.body) &&
      !(requirement.allowExplicitFailClosedState === true && bodyReferencesExplicitFailClosedState(definition.body))
    ) {
      missing.push(`${requirement.helperName}:missing backend/read-model or explicit fail-closed substance`);
    }
    for (const assignmentLine of forbiddenLocalBackendReadModelAssignments(definition.body)) {
      missing.push(`${requirement.helperName}:forbidden local backend/read-model object or array assignment ${assignmentLine}`);
    }
    for (const hook of requirement.requiredHooks ?? []) {
      if (!definition.body.includes(hook)) {
        missing.push(`${requirement.helperName}:missing hook ${hook}`);
      }
    }
    for (const { label, pattern } of requirement.requiredBodyPatterns ?? []) {
      pattern.lastIndex = 0;
      if (!pattern.test(definition.body)) {
        missing.push(`${requirement.helperName}:missing ${label}`);
      }
      pattern.lastIndex = 0;
    }
  }

  return missing;
}

function backendTiedHelper(
  helperName: string,
  requiredHooks: readonly string[],
  requiredBodyPatterns: readonly LabeledPattern[] = [],
  options: Pick<E2eHelperRequirement, "allowExplicitFailClosedState"> = {}
): E2eHelperRequirement {
  return {
    ...options,
    helperName,
    requiredBodyPatterns: [...helperSpecificRequiredBodyPatterns(helperName), ...requiredBodyPatterns],
    requiredHooks
  };
}

describe("Maya shadcn human QA contract", () => {
  it("rejects fixture, dummy, hardcoded-business, UI-decision, and Playwright fulfillment paths", () => {
    const files = readMayaUiAndE2ESources();
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const forbiddenPatterns = [
      {
        label: "Playwright route/fulfill real-backend bypass",
        pattern: /\b(?:page|context|browserContext)\.route\s*\(|\.fulfill\s*\(/u
      },
      {
        label: "active fixture/mock/sample API path",
        pattern:
          /\b(?:fixtureApiUrl|mockApiUrl|dummyApiUrl|sampleApiUrl|startFixtureApi|createFixtureApi|startMockApi|createMockApi|fixtureServer|mockServer)\b|\/api\/(?:fixture|mock|dummy|sample)\b|--fixture-api/iu
      },
      {
        label: "dummy/sample/mock business payload",
        pattern:
          /\b(?:(?:mock|dummy|sample|fixture)(?:Forensics|Maya|Worklist|Evidence|Customer|Deduction|Invoice|Action|Decision|Business|Data|Response)|(?:mockData|dummyData|sampleData|fixtureData))\b/iu
      },
      {
        label: "hardcoded customer name",
        pattern: /\b(?:Crestline|Harbor|Greenleaf|ValuMart|NorthBay)\b/u
      },
      {
        label: "hardcoded dollar amount",
        pattern: /["'`][^"'`]*\$\s?\d[\d,]*(?:\.\d{2})?[^"'`]*["'`]/u
      },
      {
        label: "hardcoded business record ID",
        pattern:
          /["'`](?:(?:POD|TPM|PRICE|CLAIM|BUREAU|FIN|DOC|EVIDENCE|ACTION|APPROVAL|AUDIT|HASH|REBILL|RECOVERY|CUST|INV|SAP)-[A-Z0-9][A-Z0-9:_-]+|S[1-8]-L\d+)["'`]/u
      },
      {
        label: "UI-computed money or decision",
        pattern:
          /\b(?:calculate\w*|compute\w*|derive\w*|classify\w*|decide\w*|setVerdict|setRouting|setDecision|setRecoveryAmount|setAmount)\s*\([^;\n]*(?:amount|delta|dollar|currency|recovery|verdict|routing|decision)/iu
      },
      {
        label: "UI arithmetic over business amount or decision fields",
        pattern:
          /\b(?:amount|deltaAmount|recoveryAmount|dollar|currency|verdict|routing|decision)\b[^;\n]*(?:[+\-*/]=|=\s*[^;\n]*(?:[+\-*/]|\bMath\.|\breduce\s*\())[^;\n]*(?:amount|deltaAmount|recoveryAmount|dollar|currency|verdict|routing|decision)\b/iu
      }
    ] as const satisfies readonly LabeledPattern[];

    expect({
      forbiddenBusinessLines: matchingLabeledLines(files, forbiddenPatterns),
      missingE2eBackendAcquisitionRequirements: missingE2eBackendAcquisitionRequirements(e2e)
    }).toEqual({
      forbiddenBusinessLines: [],
      missingE2eBackendAcquisitionRequirements: []
    });
  });

  it("requires prebuilt prompt chips and backend-tied conversational user/assistant turns in the query dock", () => {
    const queryDock = readMayaComponent("query-evidence-dock.tsx");
    const citedAnswer = readMayaComponent("cited-answer-card.tsx");
    const cockpitData = read("cockpit/app/cockpit-data.ts");
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const types = readMayaComponent("types.ts");
    const chatSource = `${queryDock}\n${citedAnswer}`;
    const promptArrayAssignmentPattern = new RegExp(`\\b${promptCollectionPattern}\\s*(?::|=)\\s*\\[`, "u");

    const contract = {
      missingPromptReadModelContract: missingPromptReadModelContract(types, cockpitData),
      literalPromptArrayAssignments: matchingLines(
        [
          { path: "cockpit/app/cockpit-data.ts", source: cockpitData },
          { path: "cockpit/components/maya/query-evidence-dock.tsx", source: queryDock }
        ],
        promptArrayAssignmentPattern
      ),
      missingChatFragments: [
        ...missingJsxTestIds(queryDock, ["maya-query-conversation", "maya-query-prompt-chip", "maya-query-user-message"]),
        ...missingJsxTestIds(chatSource, ["maya-query-assistant-message"])
      ],
      promptChipsComeFromReadModel: new RegExp(`\\bdock\\.${promptCollectionPattern}\\??\\.map\\b`, "u").test(
        stripComments(queryDock)
      ),
      queryDockUsesDisclosurePrimitive: /@\/components\/ui\/(?:accordion|collapsible)/u.test(queryDock),
      missingQueryDetailHooks: missingJsxTestIds(queryDock, [
        "maya-query-source-details",
        "maya-query-trace-details"
      ]),
      stopQueryIsRunningOnly:
        /\bisRunning\s*\?\s*\((?=[\s\S]{0,900}Stop query)(?=[\s\S]{0,900}\bcloseActiveSession\s*\()/u.test(
          stripComments(queryDock)
        ),
      stopQueryAvoidsExternalActionEndpoints:
        !/Stop query[\s\S]{0,1200}\/api\/(?:approval|actions?|recovery|billing|terms|holds?)/iu.test(
          stripComments(queryDock)
        ),
      citedAnswerUsesDisclosurePrimitive: /@\/components\/ui\/(?:accordion|collapsible)/u.test(citedAnswer),
      missingCitedSourceDetailHooks: missingJsxTestIds(citedAnswer, ["maya-cited-source-details"]),
      missingCitedAnswerBackendOrderRequirements: missingCitedAnswerBackendOrderRequirements(citedAnswer),
      citedRowsBehindSourceDetails:
        citedAnswer.indexOf('data-testid="maya-cited-source-details"') > -1 &&
        citedAnswer.indexOf('data-testid="maya-cited-source-details"') <
          citedAnswer.indexOf('data-testid="maya-cited-record-row"'),
      missingPromptChipKeyIdentityRequirements: missingPromptChipKeyIdentityRequirements(queryDock),
      missingPromptChipAccessibilityRequirements: missingPromptChipAccessibilityRequirements(queryDock),
      missingBlockedQuerySnapshotProvenanceRequirements: missingBlockedQuerySnapshotProvenanceRequirements(queryDock),
      missingStrictQueryResponseCallbackRequirements: missingStrictQueryResponseCallbackRequirements(queryDock),
      missingQueryCloseResetRequirements: missingQueryCloseResetRequirements(queryDock),
      missingStableQueryCloseLifecycleRequirements: missingStableQueryCloseLifecycleRequirements(queryDock),
      promptChipSelectsQuestion: /\bsetQuestion\(\s*(?:chip|prompt|suggestion)\./u.test(stripComments(queryDock)),
      userTurnRendersSubmittedQuestion: jsxDataTestIdContextHas(
        queryDock,
        "maya-query-user-message",
        /\bsubmittedQuestion\b/u
      ),
      assistantMessageHookTargetsStatusBubble: assistantMessageHookTargetsStatusBubble(queryDock),
      assistantTurnAvoidsDuplicatingBackendAnswer: !jsxDataTestIdContextHas(
        queryDock,
        "maya-query-assistant-message",
        /\b(?:snapshot|response)\.answer\b/u
      ),
      missingAssistantCitationRequirements: missingAssistantCitationRequirements(chatSource),
      missingConversationE2eHelperContracts: missingE2eHelperContracts(e2e, [
        backendTiedHelper("assertVisibleSelectedEvidenceScope", [
          "maya-query-selected-line",
          "maya-query-source-details",
          "maya-query-record-id"
        ], [
          {
            label: "Source details disclosure opened before selected evidence record ID assertion",
            pattern: /maya-query-source-details[\s\S]{0,900}Source details[\s\S]{0,900}\.click\s*\(/u
          }
        ]),
        backendTiedHelper("assertRenderedPromptChipsMatchBackend", ["maya-query-prompt-chip"], [
          {
            label: "rendered prompt labels compared with backend/read-model prompt labels",
            pattern: /\b(?:allTextContents|evaluateAll|innerText|textContent)\b[\s\S]{0,900}\b(?:backend|readModel|model|dock|prompt|chip|label)\b/iu
          }
        ]),
        backendTiedHelper("assertRenderedConversationTurnsMatchBackend", [
          "maya-query-user-message",
          "maya-query-assistant-message"
        ]),
        backendTiedHelper("assertRenderedCitedAnswerMatchesBackend", ["maya-cited-record-row"], [
          {
            label: "cited Sources disclosure opened before cited row assertions",
            pattern: /maya-cited-source-details[\s\S]{0,900}Sources[\s\S]{0,900}\.click\s*\(/u
          },
          {
            label: "rendered cited row order compared with backendResponse.citations order",
            pattern:
              /\bassertSameRecordIds\s*\(\s*renderedCitationRecordIds\s*,\s*backendResponse\.citations\.map\s*\(/u
          }
        ])
      ]),
      reportStyleDrawerCopyLines: matchingLines(
        [
          { path: "cockpit/components/maya/query-evidence-dock.tsx", source: queryDock },
          { path: "cockpit/components/maya/cited-answer-card.tsx", source: citedAnswer }
        ],
        /\b(?:Answer review|Submitted query|Ready for cited query|Accepted answer, deterministic basis|Read-only query\. Citations required before answer display|Backend forensic query answered with cited evidence)\b/u
      )
    };

    expect(contract).toEqual({
      missingPromptReadModelContract: [],
      literalPromptArrayAssignments: [],
      missingChatFragments: [],
      promptChipsComeFromReadModel: true,
      queryDockUsesDisclosurePrimitive: true,
      missingQueryDetailHooks: [],
      stopQueryIsRunningOnly: true,
      stopQueryAvoidsExternalActionEndpoints: true,
      citedAnswerUsesDisclosurePrimitive: true,
      missingCitedSourceDetailHooks: [],
      missingCitedAnswerBackendOrderRequirements: [],
      citedRowsBehindSourceDetails: true,
      missingPromptChipKeyIdentityRequirements: [],
      missingPromptChipAccessibilityRequirements: [],
      missingBlockedQuerySnapshotProvenanceRequirements: [],
      missingStrictQueryResponseCallbackRequirements: [],
      missingQueryCloseResetRequirements: [],
      missingStableQueryCloseLifecycleRequirements: [],
      promptChipSelectsQuestion: true,
      userTurnRendersSubmittedQuestion: true,
      assistantMessageHookTargetsStatusBubble: true,
      assistantTurnAvoidsDuplicatingBackendAnswer: true,
      missingAssistantCitationRequirements: [],
      missingConversationE2eHelperContracts: [],
      reportStyleDrawerCopyLines: []
    });
  });

  it("requires a nonblank symbolic agent process map before and after a Maya query", () => {
    const agentTrace = readMayaComponent("agent-trace-panel.tsx");
    const queryDock = readMayaComponent("query-evidence-dock.tsx");
    const workspace = readMayaComponent("deduction-case-workspace.tsx");
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const traceAndDock = `${agentTrace}\n${queryDock}`;
    const compactSourceLabelFormatter = findFunctionDefinition(stripComments(agentTrace), "formatTraceRetrievalSourceLabel");

    const contract = {
      agentTraceTabHasStableHook: hasJsxDataTestId(workspace, "maya-case-agent-trace-tab"),
      traceTabPanelRendersTraceUi: traceTabPanelRendersTraceUi(workspace),
      missingTraceFragments: missingJsxTestIds(agentTrace, ["maya-agent-process-map", "maya-agent-process-node"]),
      tracePanelUsesDisclosurePrimitive: /@\/components\/ui\/(?:accordion|collapsible)/u.test(agentTrace),
      missingTraceDetailsHook: missingJsxTestIds(agentTrace, ["maya-agent-trace-details"]),
      processMapBeforeRawTraceDetails:
        agentTrace.indexOf('data-testid="maya-agent-process-map"') > -1 &&
        agentTrace.indexOf('data-testid="maya-agent-process-map"') <
          agentTrace.indexOf('data-testid="maya-agent-trace-details"'),
      rawTraceTableBehindDetails:
        agentTrace.indexOf('data-testid="maya-agent-trace-details"') > -1 &&
        agentTrace.indexOf('data-testid="maya-agent-trace-details"') <
          agentTrace.indexOf('data-testid="maya-backend-trace-table"'),
      noStaticTraceRowArrays:
        !/\b(?:const|let|var)\s+(?:traceRows|traceEvents|agentTraceRows|staticTraceRows)\s*(?::[^=]+)?=\s*\[/u.test(
          stripComments(agentTrace)
        ),
      noSyntheticSelectedEvidenceRecordId: !stripComments(agentTrace).includes("selected-evidence-read-model"),
      symbolicProcessNodeMarkers: /\bdata-(?:agent|process)-node(?:-kind)?=/.test(stripComments(agentTrace)),
      missingTraceDataDrivenRendering: missingTraceDataDrivenRendering(traceAndDock),
      missingSelectedEvidenceNodeRecordIdRequirements: missingSelectedEvidenceNodeRecordIdRequirements(agentTrace),
      missingRetrievalSourceRequirements: missingTraceSapSupabaseRetrievalRequirements(agentTrace),
      missingInvestigatorTraceRequirements: missingInvestigatorTraceRequirements(agentTrace),
      missingRecoveryTraceRequirements: missingRecoveryTraceRequirements(agentTrace),
      missingCitationTraceRequirements: missingCitationTraceRequirements(agentTrace),
      missingBasisTraceRequirements: missingBasisTraceRequirements(agentTrace),
      missingQueryDockTracePanelRendering: missingQueryDockTracePanelRendering(queryDock),
      missingCaseWorkspaceQueryResponseRequirements: missingCaseWorkspaceQueryResponseRequirements(workspace),
      tracePanelHasNoBlankPreQueryCopy: !/(Trace unavailable|Submit a query to load backend trace rows|backend returned no query trace rows)/iu.test(
        stripComments(agentTrace)
      ),
      traceTabDoesNotPassUndefinedTrace: !stripComments(workspace).includes("<AgentTracePanel response={undefined}"),
      traceDetailsE2eHelperOpensDisclosure:
        /function\s+openAgentTraceDetailsAndReadText[\s\S]{0,900}maya-agent-trace-details[\s\S]{0,900}Trace details[\s\S]{0,900}\.click\s*\(/u.test(
          e2e
        ),
      traceRowsE2eHelperOpensDisclosureBeforeRowAssertion:
        /function\s+assertRenderedTraceRowsMatchBackend[\s\S]{0,700}\bopenAgentTraceDetailsAndReadText\s*\(\s*page\s*\)[\s\S]{0,700}maya-backend-trace-row/u.test(
          e2e
        ),
      denseTraceRowsAssertedFromTraceTab: queryScenarioFlowAssertsDenseTraceRowsFromTraceTab(e2e),
      compactProcessNodesAvoidRawBackendSummaryText:
        !/\bmessage\s*:\s*(?:document\.summary|citation\.summary\b)/u.test(stripComments(agentTrace)),
      compactProcessNodesUseNonIdSourceMessages:
        /\bcompactEvidenceDocumentProcessMessage\b/u.test(agentTrace) && /\bcompactCitationProcessMessage\b/u.test(agentTrace),
      compactProcessNodesShowSourceBackedTrustLabel:
        compactSourceLabelFormatter !== undefined &&
        contextHasPattern(extractAgentProcessNodeContexts(agentTrace), /\bformatTraceRetrievalSourceLabel\s*\(\s*node\s*\)/u) &&
        /\bresolveTraceRetrievalSource\s*\(\s*node\s*\)/u.test(compactSourceLabelFormatter.body) &&
        /["']Source-backed["']/u.test(compactSourceLabelFormatter.body),
      compactSourceTrustLabelAvoidsRawBackendDetails:
        compactSourceLabelFormatter !== undefined &&
        !/\b(?:recordIds|citations|summary|detailMessage|deterministicBasis|hook|sourceLabel|label)\b/u.test(
          compactSourceLabelFormatter.body
        ),
      rawBackendSummaryTextRemainsBehindTraceDetails:
        /\bdetailMessage\s*:\s*(?:document\.summary|citation\.summary\b)/u.test(stripComments(agentTrace)) &&
        /data-testid="maya-agent-trace-details"[\s\S]{0,2400}\bnode\.detailMessage\b/u.test(stripComments(agentTrace)),
      missingProcessNodeMatcherPriorityRequirements: missingProcessNodeMatcherPriorityRequirements(e2e),
      missingProcessMapE2eHelperContracts: missingE2eHelperContracts(e2e, [
        backendTiedHelper("assertAgentProcessMapBeforeQuery", ["maya-case-agent-trace-tab", "maya-agent-process-node"], [
          {
            label: "Agent Trace tab click before query",
            pattern: /maya-case-agent-trace-tab[\s\S]{0,360}\.click\s*\(/u
          },
          {
            label: "source-backed UI summary provenance accepted before query without backend trace attrs",
            pattern: /\bnode\.uiProcessKind\s*!==\s*null[\s\S]{0,180}\bnode\.retrievalSource\s*===\s*null[\s\S]{0,180}\bnode\.sourceKind\s*===\s*null/u
          },
          {
            label: "source-backed backend provenance visibly asserted before query",
            pattern: /source-backed/iu
          },
          {
            label: "Trace details disclosure used for selected evidence record IDs before query",
            pattern: /\bopenAgentTraceDetailsAndReadText\s*\(\s*page\s*\)/u
          },
          {
            label: "process node data-record-ids asserted before query",
            pattern: /\brecordIdsInProcessNodeData\b[\s\S]{0,900}\.has\s*\(\s*recordId\s*\)/u
          },
          {
            label: "Trace details text asserts selected evidence record IDs before query",
            pattern: /\btraceDetailsText\b[\s\S]{0,500}\.includes\s*\(\s*normalizeUiText\s*\(\s*recordId\s*\)\s*\)/u
          },
          {
            label: "compact process cards stay free of raw evidence record IDs",
            pattern: /compact process map leaked selected backend evidence recordId/u
          }
        ]),
        backendTiedHelper("assertAgentProcessMapAfterQuery", ["maya-case-agent-trace-tab", "maya-agent-process-node"], [
          {
            label: "Agent Trace tab click after query",
            pattern: /maya-case-agent-trace-tab[\s\S]{0,360}\.click\s*\(/u
          }
        ])
      ])
    };

    expect(contract).toEqual({
      agentTraceTabHasStableHook: true,
      traceTabPanelRendersTraceUi: true,
      missingTraceFragments: [],
      tracePanelUsesDisclosurePrimitive: true,
      missingTraceDetailsHook: [],
      processMapBeforeRawTraceDetails: true,
      rawTraceTableBehindDetails: true,
      noStaticTraceRowArrays: true,
      noSyntheticSelectedEvidenceRecordId: true,
      symbolicProcessNodeMarkers: true,
      missingTraceDataDrivenRendering: [],
      missingSelectedEvidenceNodeRecordIdRequirements: [],
      missingRetrievalSourceRequirements: [],
      missingInvestigatorTraceRequirements: [],
      missingRecoveryTraceRequirements: [],
      missingCitationTraceRequirements: [],
      missingBasisTraceRequirements: [],
      missingQueryDockTracePanelRendering: [],
      missingCaseWorkspaceQueryResponseRequirements: [],
      tracePanelHasNoBlankPreQueryCopy: true,
      traceTabDoesNotPassUndefinedTrace: true,
      traceDetailsE2eHelperOpensDisclosure: true,
      traceRowsE2eHelperOpensDisclosureBeforeRowAssertion: true,
      denseTraceRowsAssertedFromTraceTab: true,
      compactProcessNodesAvoidRawBackendSummaryText: true,
      compactProcessNodesUseNonIdSourceMessages: true,
      compactProcessNodesShowSourceBackedTrustLabel: true,
      compactSourceTrustLabelAvoidsRawBackendDetails: true,
      rawBackendSummaryTextRemainsBehindTraceDetails: true,
      missingProcessNodeMatcherPriorityRequirements: [],
      missingProcessMapE2eHelperContracts: []
    });
  });

  it("requires a persistent Back/Return-to-worklist affordance in case detail and browser coverage for it", () => {
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const workspace = readMayaComponent("deduction-case-workspace.tsx");

    const contract = {
      e2eUsesCaseReturnHook: e2eHasMeaningfulCoverage(e2e, "maya-case-return-to-worklist"),
      hasAccessibleBackLabel: /(?:Back to worklist|Return to worklist)/u.test(workspace),
      hasCaseReturnButtonHook: hasJsxDataTestId(workspace, "maya-case-return-to-worklist"),
      missingReturnE2eHelperContracts: missingE2eHelperContracts(e2e, [
        backendTiedHelper(
          "assertReturnToWorklistRestoresWorklist",
          ["maya-case-return-to-worklist", "maya-beat-12-return-table"],
          [
            {
              label: "return control click",
              pattern: /maya-case-return-to-worklist[\s\S]{0,360}\.click\s*\(/u
            },
            {
              label: "case detail cleared or de-emphasized",
              pattern: /\b(?:maya-case-workspace|case-detail-only|de-emphasized|detached|hidden|toBeHidden|not\.toBeVisible|count\(\)\s*===\s*0)\b/iu
            }
          ],
          { allowExplicitFailClosedState: true }
        )
      ]),
      returnButtonCallsCaseHandler: stripComments(workspace).includes("onClick={onReturnToWorklist}")
    };

    expect(contract).toEqual({
      e2eUsesCaseReturnHook: true,
      hasAccessibleBackLabel: true,
      hasCaseReturnButtonHook: true,
      missingReturnE2eHelperContracts: [],
      returnButtonCallsCaseHandler: true
    });
  });

  it("requires browser-clickable root sidebar section hooks", () => {
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const surface = readMayaComponent("maya-forensics-surface.tsx");
    const rootSectionHooks = [
      "maya-root-section-overview",
      "maya-root-section-worklist",
      "maya-root-section-cases",
      "maya-root-section-evidence",
      "maya-root-section-approvals"
    ] as const;

    const contract = {
      missingRootSectionHooks: missingJsxTestIds(surface, rootSectionHooks),
      missingRootSidebarE2eHelperContracts: missingE2eHelperContracts(e2e, [
        {
          helperName: "assertRootSidebarSectionNavigation",
          requiredBodyPatterns: [
            {
              label: "sidebar section buttons clicked by accessible name",
              pattern:
                /\bgetByRole\s*\(\s*["']button["']\s*,\s*\{\s*name:\s*section\.buttonName\s*\}\s*\)\.click\s*\(\s*\)/u
            },
            {
              label: "worklist badge asserted against backend worklist",
              pattern: /\bforensicsModel\.worklist\.length\b[\s\S]{0,900}\bassert\s*\(/u
            },
            {
              label: "approvals badge asserted against backend action inbox",
              pattern: /\bforensicsModel\.actionInbox\.length\b[\s\S]{0,900}\bassert\s*\(/u
            }
          ],
          requiredHooks: ["maya-sidebar-nav-item", ...rootSectionHooks]
        }
      ])
    };

    expect(contract).toEqual({
      missingRootSectionHooks: [],
      missingRootSidebarE2eHelperContracts: []
    });
  });

  it("rejects active-looking worklist controls without backing behavior", () => {
    const worklist = stripComments(readMayaComponent("deduction-worklist-table.tsx"));
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const returnedWorklist = surface.slice(surface.indexOf("function BeatTwelveReturnedWorklist"));

    expect(worklist).toContain("Search by scenario, customer, or line ID");
    expect(worklist).not.toContain("Save view");
    expect(worklist).not.toContain("Worklist display options");
    expect(worklist).not.toContain("More filters");
    expect(worklist).not.toMatch(/<Button\b[\s\S]{0,260}\bRecommended action\b[\s\S]{0,160}<\/Button>/u);
    expect(worklist).not.toMatch(/<Button\b[\s\S]{0,220}>\s*Queue\s*<\/Button>/u);
    expect(worklist).not.toMatch(/<DropdownMenuTrigger\b[\s\S]{0,360}\bMore filters\b/u);
    expect(surface).not.toContain("Add note");
    expect(surface).not.toContain("maya-local-row-action-add-note");
    expect(surface).not.toContain("FilterIcon");
    expect(surface).not.toContain("Columns3Icon");
    expect(returnedWorklist).not.toMatch(/<Button\b[^>]*\bdisabled\b[\s\S]{0,180}\b(?:Filters|Columns)\b/u);
    expect(returnedWorklist).not.toMatch(
      /aria-label=["']Refresh unavailable: no backend refresh action is exposed["'][\s\S]{0,180}\bdisabled\b/u
    );
  });

  it("requires component-specific browser/E2E hooks for each major Maya component", () => {
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const coverageTargets = [
      { component: "MayaWorkspaceShell", fileName: "maya-workspace-shell.tsx", hook: "maya-shadcn-workbench" },
      { component: "MayaRunKpiStrip", fileName: "maya-run-kpi-strip.tsx", hook: "maya-run-kpi-strip" },
      { component: "SourceReadinessStrip", fileName: "source-readiness-strip.tsx", hook: "maya-source-readiness-strip" },
      { component: "DeductionWorklistTable", fileName: "deduction-worklist-table.tsx", hook: "maya-worklist-table" },
      { component: "RecommendedActionCell", fileName: "recommended-action-cell.tsx", hook: "maya-recommended-action-badge" },
      { component: "DeductionCaseWorkspace", fileName: "deduction-case-workspace.tsx", hook: "maya-case-workspace" },
      { component: "EvidenceDossier", fileName: "evidence-dossier.tsx", hook: "maya-evidence-dossier" },
      { component: "QueryEvidenceDock", fileName: "query-evidence-dock.tsx", hook: "maya-query-dock" },
      { component: "AgentTracePanel", fileName: "agent-trace-panel.tsx", hook: "maya-agent-trace" },
      { component: "CitedAnswerCard", fileName: "cited-answer-card.tsx", hook: "maya-cited-answer" },
      { component: "RecoveryDraftReview", fileName: "recovery-draft-review.tsx", hook: "maya-recovery-draft-review" },
      { component: "ApprovalGateDialog", fileName: "approval-gate-dialog.tsx", hook: "maya-approval-gate-dialog" },
      { component: "AuditConfirmationPanel", fileName: "audit-confirmation-panel.tsx", hook: "maya-audit-confirmation" }
    ] as const;

    const missingProductionHooks = coverageTargets
      .filter((target) => !hasJsxDataTestId(readMayaComponent(target.fileName), target.hook))
      .map((target) => `${target.component}:${target.hook}`);
    const missingE2eHooks = coverageTargets
      .filter((target) => !e2eHasMeaningfulCoverage(e2e, target.hook))
      .map((target) => `${target.component}:${target.hook}`);
    const missingNamedCoverageHelpers = missingE2eHelperContracts(e2e, [
      backendTiedHelper("assertRenderedKpiStripMatchesBackend", ["maya-run-kpi-strip"], [
        {
          label: "Overview section opened before KPI strip assertion",
          pattern:
            /\bgetByRole\s*\(\s*["']button["']\s*,\s*\{\s*name:\s*\/\^Overview\$\/u\s*\}\s*\)\.click\s*\(\s*\)[\s\S]{0,900}maya-root-section-overview[\s\S]{0,900}maya-run-kpi-strip/u
        }
      ]),
      backendTiedHelper("assertRenderedSourceReadinessMatchesBackend", ["maya-source-readiness-strip"]),
      backendTiedHelper("assertRenderedWorklistTableMatchesBackend", ["maya-worklist-table"], [
        {
          label: "Worklist section opened before worklist table assertion",
          pattern:
            /\bgetByRole\s*\(\s*["']button["']\s*,\s*\{\s*name:\s*\/\^Worklist\$\/u\s*\}\s*\)\.click\s*\(\s*\)[\s\S]{0,900}maya-root-section-worklist[\s\S]{0,900}maya-worklist-table/u
        }
      ]),
      backendTiedHelper("assertRenderedRecommendedActionCellMatchesBackend", ["maya-recommended-action-badge"]),
      backendTiedHelper("assertRenderedEvidenceDossierMatchesBackend", ["maya-evidence-dossier"]),
      backendTiedHelper("assertRenderedQueryDockMatchesBackend", ["maya-query-dock"]),
      backendTiedHelper("assertRenderedAgentTracePanelMatchesBackend", ["maya-agent-trace", "maya-agent-process-node"], [
        {
          label: "trace hook asserted from data-hook or trace details",
          pattern: /\b(?:renderedNode\.hook|traceDetailsText)\b[\s\S]{0,500}\bevent\.hook\b/u
        },
        {
          label: "trace deterministic basis asserted from data attribute or trace details",
          pattern: /\b(?:renderedNode\.deterministicBasis|traceDetailsText)\b[\s\S]{0,500}\bevent\.deterministicBasis\b/u
        }
      ]),
      backendTiedHelper("assertRenderedCitedAnswerMatchesBackend", ["maya-cited-answer"]),
      backendTiedHelper("assertRenderedRecoveryDraftMatchesBackend", ["maya-recovery-draft-review"], [], {
        allowExplicitFailClosedState: true
      }),
      backendTiedHelper("assertRenderedApprovalGateMatchesBackend", ["maya-approval-gate-dialog"], [], {
        allowExplicitFailClosedState: true
      }),
      backendTiedHelper("assertRenderedAuditConfirmationMatchesBackend", ["maya-audit-confirmation"], [], {
        allowExplicitFailClosedState: true
      })
    ]);

    expect({ missingE2eHooks, missingNamedCoverageHelpers, missingProductionHooks }).toEqual({
      missingE2eHooks: [],
      missingNamedCoverageHelpers: [],
      missingProductionHooks: []
    });
  });

  it("requires Maya styling to move away from broad green sidebar/ready/selection dominance", () => {
    const files = readMayaProductionFiles();
    const nonSourceHealthFiles = files.filter(
      (file) =>
        !file.path.endsWith("/source-readiness-strip.tsx") &&
        !/SourceReadiness|sourceReadiness|sourceHealth|source-status|data-status-tone/u.test(file.source)
    );

    const contract = {
      directGreenDominanceLines: matchingLines(
        files,
        /\b(?:bg|text|border|ring|from|via|to)-(?:green|emerald|teal|lime)-\d{2,3}\b|#[0-9a-fA-F]{6}/u
      ).filter((line) => /(?:green|emerald|teal|lime|#[0-9a-fA-F]{6})/iu.test(line)),
      genericSelectionGreenLines: matchingLines(
        files,
        /data-\[(?:active|selected)=true\][^"`']*\b(?:bg-primary|ring-primary|sidebar-primary|status-success|green|emerald|teal|lime)\b/u
      ),
      tokenizedSuccessOutsideSourceHealth: matchingLines(
        nonSourceHealthFiles,
        /\b(?:status-success|success-text|statusTone\s*===\s*"ready")\b/u
      ),
      broadShellGreenBackgroundLines: matchingLines(
        files,
        /\b(?:min-h-svh|h-screen|w-screen|Sidebar|Shell)[^"`']*\b(?:bg-primary|bg-sidebar-primary|status-success|green|emerald|teal|lime)\b/u
      )
    };

    expect(contract).toEqual({
      directGreenDominanceLines: [],
      genericSelectionGreenLines: [],
      tokenizedSuccessOutsideSourceHealth: [],
      broadShellGreenBackgroundLines: []
    });
  });

  it("requires shadcn app identity tokens to use neutral operations chrome instead of global teal", () => {
    const tokensCss = read("tokens.css");
    const tokensJson = JSON.parse(read("tokens.json")) as {
      color: Record<string, unknown> & {
        dark: Record<string, string>;
        neutral: Record<string, string>;
      };
    };
    const shadcnStyles = read("cockpit/app/styles.css");
    const expectedCoreTokens = {
      "color-primary": "#27272A",
      "color-primary-hover": "#18181B",
      "color-primary-active": "#09090B",
      "color-primary-deep": "#18181B",
      "color-primary-subtle": "#E4E4E7",
      "color-primary-tint": "#F4F4F5",
      "focus-ring": "#2563EB"
    };
    const expectedNeutralTokens = {
      "900": "#18181B",
      "800": "#27272A",
      "700": "#3F3F46",
      "600": "#52525B",
      "500": "#71717A",
      "400": "#A1A1AA",
      "300": "#D4D4D8",
      "200": "#E4E4E7",
      "100": "#F4F4F5",
      "50": "#FAFAFA",
      white: "#FFFFFF"
    };
    const staleGlobalTealValues = ["#0C6E6B", "#0A5755", "#084746", "#053B3B", "#DCEEED", "#EAF5F4", "#2EC4BB"];
    const serializedTokens = JSON.stringify(tokensJson);

    expect({
      coreCssTokens: cssVariables(tokensCss, Object.keys(expectedCoreTokens)),
      coreJsonTokens: {
        primary: tokensJson.color.primary,
        primaryHover: tokensJson.color.primaryHover,
        primaryActive: tokensJson.color.primaryActive,
        primaryDeep: tokensJson.color.primaryDeep,
        primarySubtle: tokensJson.color.primarySubtle,
        primaryTint: tokensJson.color.primaryTint,
        focus: tokensJson.color.focus
      },
      darkIdentityTokens: {
        bgCanvas: tokensJson.color.dark.bgCanvas,
        bgSurface: tokensJson.color.dark.bgSurface,
        bgSubtle: tokensJson.color.dark.bgSubtle,
        primary: tokensJson.color.dark.primary,
        focus: tokensJson.color.dark.focus
      },
      neutralCssTokens: cssVariables(
        tokensCss,
        Object.keys(expectedNeutralTokens).map((key) => (key === "white" ? "white" : `neutral-${key}`))
      ),
      neutralJsonTokens: tokensJson.color.neutral,
      sidebarUsesNeutralShell: /--sidebar:\s*var\(--neutral-900\);/u.test(shadcnStyles),
      sidebarSelectionUsesNeutralPrimary: /--sidebar-primary:\s*var\(--neutral-700\);/u.test(shadcnStyles),
      sidebarActiveUsesVisibleNeutralAccent: /--sidebar-accent:\s*var\(--neutral-700\);/u.test(shadcnStyles),
      accentUsesNeutralHoverSurface: /--accent:\s*var\(--bg-subtle\);/u.test(shadcnStyles),
      accentForegroundUsesTextPrimary: /--accent-foreground:\s*var\(--text-primary\);/u.test(shadcnStyles),
      legacyActiveRowsAvoidTransparentNeutralPrimary:
        !/\.module-map-row\.active\s*\{[\s\S]{0,180}background:\s*color-mix\(in srgb,\s*var\(--color-primary\)\s*36%,\s*transparent\);/u.test(
          shadcnStyles
        ),
      legacyActiveRowsUseVisibleNeutralAccent:
        /\.module-map-row\.active\s*\{[\s\S]{0,180}background:\s*var\(--neutral-700\);/u.test(shadcnStyles),
      staleGlobalTealValues: staleGlobalTealValues.filter(
        (hex) => tokensCss.includes(hex) || serializedTokens.includes(hex)
      )
    }).toEqual({
      coreCssTokens: expectedCoreTokens,
      coreJsonTokens: {
        primary: "#27272A",
        primaryHover: "#18181B",
        primaryActive: "#09090B",
        primaryDeep: "#18181B",
        primarySubtle: "#E4E4E7",
        primaryTint: "#F4F4F5",
        focus: "#2563EB"
      },
      darkIdentityTokens: {
        bgCanvas: "#09090B",
        bgSurface: "#18181B",
        bgSubtle: "#27272A",
        primary: "#E4E4E7",
        focus: "#60A5FA"
      },
      neutralCssTokens: {
        "neutral-900": "#18181B",
        "neutral-800": "#27272A",
        "neutral-700": "#3F3F46",
        "neutral-600": "#52525B",
        "neutral-500": "#71717A",
        "neutral-400": "#A1A1AA",
        "neutral-300": "#D4D4D8",
        "neutral-200": "#E4E4E7",
        "neutral-100": "#F4F4F5",
        "neutral-50": "#FAFAFA",
        white: "#FFFFFF"
      },
      neutralJsonTokens: expectedNeutralTokens,
      sidebarUsesNeutralShell: true,
      sidebarSelectionUsesNeutralPrimary: true,
      sidebarActiveUsesVisibleNeutralAccent: true,
      accentUsesNeutralHoverSurface: true,
      accentForegroundUsesTextPrimary: true,
      legacyActiveRowsAvoidTransparentNeutralPrimary: true,
      legacyActiveRowsUseVisibleNeutralAccent: true,
      staleGlobalTealValues: []
    });
  });

  it("keeps Maya backend-content boundaries for refresh failures, KPI rows, and trace summaries", () => {
    const sourceStrip = readMayaComponent("source-readiness-strip.tsx");
    const kpiStrip = readMayaComponent("maya-run-kpi-strip.tsx");
    const agentTrace = readMayaComponent("agent-trace-panel.tsx");
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");

    expect({
      e2eAgentTraceFiltersBackendNodes: e2e.includes(
        "const backendTraceNodes = renderedProcessNodes.filter(isRenderedBackendTraceNode);"
      ),
      e2eAgentTraceRequiresExactBackendTraceNodeCount: /backendTraceNodes\.length === backendTrace\.length/u.test(e2e),
      e2eAgentTraceMatchesOnlyBackendNodes: e2e.includes(
        "findRenderedAgentProcessNodeForTraceEvent(backendTraceNodes, event)"
      ),
      e2eKpiHelperDoesNotMirrorUiFiltering: !e2e.includes("function visibleKpiItemsFromBackend"),
      e2eKpiHelperRequiresBackendOrder: /forensicsModel\.kpiStrip\.forEach\(\(item,\s*index\)/u.test(e2e),
      e2eKpiHelperRequiresExactBackendCount: /renderedKpiCards\.count\(\)[\s\S]{0,240}forensicsModel\.kpiStrip\.length/u.test(e2e),
      kpiCardsExposeBackendOrderHooks:
        kpiStrip.includes('data-testid="maya-kpi-card"') && kpiStrip.includes("data-kpi-label={item.label}"),
      kpiCardsMapBackendItemsOnly: /items\.map\(\(item,\s*index\)/u.test(kpiStrip),
      kpiCardsNeverInjectMissingPriorityMetric:
        !/\b(?:High-priority items|Not exposed|Priority field not exposed|Read-model gap|contract-gap)\b/u.test(kpiStrip),
      kpiCardsNeverSliceBackendRows: !/\bitems\.slice\s*\(/u.test(kpiStrip),
      sourceRefreshFailureHasLocalStatus:
        sourceStrip.includes("sourceRefreshError") &&
        sourceStrip.includes('data-testid="maya-source-refresh-status"') &&
        sourceStrip.includes("aria-live"),
      sourceRefreshFailureDoesNotRewriteBackendModel:
        !sourceStrip.includes("toBlockedConnectorReadiness") &&
        !/\bsourceTiles\s*:\s*currentConnectors\.sourceTiles\.map/u.test(sourceStrip) &&
        !/\bsourceHealth\s*:\s*currentConnectors\.sourceHealth\.map/u.test(sourceStrip) &&
        !/\bprovenance\s*=\s*\{/u.test(sourceStrip) &&
        !/\bstatus\s*:\s*"blocked"/u.test(sourceStrip) &&
        !/\brecordIds\s*:\s*\[\]/u.test(sourceStrip),
      sourceRefreshAcceptsOnlyCompleteBackendModel:
        sourceStrip.includes("isMayaFieldProvenance") &&
        sourceStrip.includes("isSourceHealthResult") &&
        sourceStrip.includes("isSourceTile") &&
        sourceStrip.includes("isConnectorProof") &&
        sourceStrip.includes("isConnectorReadinessEntry") &&
        /sourceHealth\.every\(isSourceHealthResult\)/u.test(sourceStrip) &&
        /sourceTiles\.every\(isSourceTile\)/u.test(sourceStrip) &&
        /connectors\.every\(isConnectorReadinessEntry\)/u.test(sourceStrip),
      traceBackendAttributesAreConditional:
        agentTrace.includes("isBackendTraceProcessNode") &&
        /data-agent-node=\{isBackendTrace \? node\.agentName : undefined\}/u.test(agentTrace) &&
        /data-hook=\{isBackendTrace \? node\.hook : undefined\}/u.test(agentTrace) &&
        /data-retrieval-source=\{isBackendTrace \? resolveTraceRetrievalSource\(node\) : undefined\}/u.test(agentTrace) &&
        /data-source-kind=\{isBackendTrace \? resolveTraceSourceKind\(node\) : undefined\}/u.test(agentTrace),
      traceUiSummariesUseLocalAttributes: agentTrace.includes('data-ui-process-kind={!isBackendTrace ? node.nodeKind : undefined}')
    }).toEqual({
      e2eAgentTraceFiltersBackendNodes: true,
      e2eAgentTraceRequiresExactBackendTraceNodeCount: true,
      e2eAgentTraceMatchesOnlyBackendNodes: true,
      e2eKpiHelperDoesNotMirrorUiFiltering: true,
      e2eKpiHelperRequiresBackendOrder: true,
      e2eKpiHelperRequiresExactBackendCount: true,
      kpiCardsExposeBackendOrderHooks: true,
      kpiCardsMapBackendItemsOnly: true,
      kpiCardsNeverInjectMissingPriorityMetric: true,
      kpiCardsNeverSliceBackendRows: true,
      sourceRefreshFailureHasLocalStatus: true,
      sourceRefreshFailureDoesNotRewriteBackendModel: true,
      sourceRefreshAcceptsOnlyCompleteBackendModel: true,
      traceBackendAttributesAreConditional: true,
      traceUiSummariesUseLocalAttributes: true
    });
  });

  it("requires the query dock to fail closed when backend prompt suggestions are unavailable", () => {
    const source = read("cockpit/components/maya/query-evidence-dock.tsx");

    expect(source).toMatch(/dock\.promptSuggestions\?\.map\(\(prompt\)\s*=>/u);
    expect(source).not.toMatch(/dock\.promptSuggestions\.map\(\(prompt\)\s*=>/u);
  });
});

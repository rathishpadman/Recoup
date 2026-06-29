import { existsSync, readdirSync, readFileSync } from "node:fs";
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

function stripJsxElement(source: string, tagName: string): string {
  let sanitized = source;
  let openIndex = sanitized.search(new RegExp(`<${tagName}\\b`, "u"));

  while (openIndex >= 0) {
    const closeMatch = new RegExp(`</${tagName}>`, "u").exec(sanitized.slice(openIndex));
    if (closeMatch === null) {
      break;
    }

    const closeIndex = openIndex + closeMatch.index + closeMatch[0].length;
    sanitized = `${sanitized.slice(0, openIndex)}${" ".repeat(closeIndex - openIndex)}${sanitized.slice(closeIndex)}`;
    const nextSearchStart = openIndex + 1;
    const nextMatch = new RegExp(`<${tagName}\\b`, "u").exec(sanitized.slice(nextSearchStart));
    openIndex = nextMatch === null ? -1 : nextSearchStart + nextMatch.index;
  }

  return sanitized;
}

function primaryMayaSource(source: string): string {
  let primary = stripComments(source);
  for (const tagName of ["TooltipContent", "CollapsibleContent", "AccordionContent"]) {
    primary = stripJsxElement(primary, tagName);
  }

  return primary
    .split(/\r?\n/u)
    .filter((line) => !/\bsr-only\b/u.test(line))
    .join("\n");
}

function stripNamedFunction(source: string, functionName: string): string {
  const startMatch = new RegExp(`function\\s+${escapeRegExp(functionName)}\\b`, "u").exec(source);
  if (startMatch === null) {
    return source;
  }

  const bodyStart = source.indexOf("{", startMatch.index);
  if (bodyStart < 0) {
    return source;
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return `${source.slice(0, startMatch.index)}${" ".repeat(index + 1 - startMatch.index)}${source.slice(index + 1)}`;
      }
    }
  }

  return source;
}

function taskTwoPrimarySource(fileName: string): string {
  let source = primaryMayaSource(readMayaComponent(fileName));
  if (fileName === "audit-confirmation-panel.tsx") {
    source = stripNamedFunction(stripNamedFunction(source, "unavailableRows"), "confirmedRows");
  }

  return source;
}

function visibleTextFragments(source: string): string {
  return source
    .replace(/<[^>]+>/gu, " ")
    .replace(/[{}]/gu, " ")
    .replace(/\s+/gu, " ");
}

function visiblePrimaryPlumbingLines(files: readonly SourceFile[]): string[] {
  return matchingLines(
    files,
    /(?:(["'`])(?:(?!\1).)*\b(?:backend|read-model|read model|fetched)\b(?:(?!\1).)*\1|>[^<]*\b(?:backend|read-model|read model|fetched)\b[^<]*<)/iu
  ).filter((line) => !/\b(?:aria-label|data-testid)=/u.test(line));
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

function jsxDataTestIdContext(source: string, testId: string, radius = 1_200): string {
  const stripped = stripComments(source);
  const escapedTestId = escapeRegExp(testId);
  const dataTestIdPattern = new RegExp(
    `\\bdata-testid\\s*=\\s*(?:"${escapedTestId}"|'${escapedTestId}'|\\{\\s*["']${escapedTestId}["']\\s*\\})`,
    "u"
  );
  const match = dataTestIdPattern.exec(stripped);

  if (match === null) {
    return "";
  }

  const start = Math.max(0, match.index - Math.floor(radius / 2));

  return stripped.slice(start, start + radius);
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

function assistantMessageHookTargetsAnswerBubble(source: string): boolean {
  return (
    /data-testid="maya-query-assistant-message"[\s\S]{0,1800}\bdata-testid="maya-query-assistant-answer"/u.test(
      stripComments(source)
    ) &&
    /data-testid="maya-query-assistant-answer"[\s\S]{0,420}\bdisplayAnswerWithoutInlineRecordIds\(snapshot\.answer(?:\s*\?\?\s*"")?,\s*snapshot\.recordIds\)/u.test(
      stripComments(source)
    )
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
    `\\b(?:dock\\.${promptCollectionPattern}\\??|(?:dedupedPromptSuggestions|uniquePromptSuggestions|promptSuggestions))\\.map\\s*\\(\\s*\\(?\\s*([A-Za-z_$][\\w$]*)\\b`,
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
  if (!/\bresetParentTrace\?\s*:\s*boolean\b/u.test(stripped)) {
    missing.push("closeActiveSession must expose an explicit resetParentTrace option for Stop query");
  }
  if (!/\boptions\.resetParentTrace\s*===\s*true\b[\s\S]{0,180}\bonResponseRef\.current\s*\(\s*selectedEvidenceResetResponseRef\.current\s*\)/u.test(closeActiveSession.body)) {
    missing.push("Stop query must publish a concrete stopped selected-evidence snapshot to parent trace");
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

function primaryAgentTraceProcessMapSource(source: string): string {
  const stripped = stripComments(source);
  const processMapIndex = stripped.indexOf('data-testid="maya-agent-process-map"');
  const traceDetailsIndex = stripped.indexOf('data-testid="maya-agent-trace-details"');
  if (processMapIndex === -1 || traceDetailsIndex === -1 || traceDetailsIndex <= processMapIndex) {
    return "";
  }

  return stripped.slice(processMapIndex, traceDetailsIndex);
}

function stripJsxDataAttributes(source: string): string {
  return source
    .replace(/\sdata-[a-z0-9-]+\s*=\s*\{(?:[^{}]|\{[^{}]*\})*\}/giu, "")
    .replace(/\sdata-[a-z0-9-]+\s*=\s*(?:"[^"]*"|'[^']*')/giu, "");
}

function missingBusinessReadablePrimaryTraceRequirements(source: string): string[] {
  const primaryProcessMap = stripJsxDataAttributes(primaryAgentTraceProcessMapSource(source));
  const missing: string[] = [];

  if (primaryProcessMap.length === 0) {
    missing.push("primary Agent Trace process map source could not be isolated before Trace details");
    return missing;
  }
  if (/\bnode\.(?:label|message|phase|hook)\b/u.test(primaryProcessMap)) {
    missing.push("primary Agent Trace process map renders raw backend trace labels/messages/phases/hooks");
  }
  if (/\b(?:agent_tool_start|agent_tool_end|sourceKind|retrievalSource|OpenAI Agents SDK)\b/u.test(primaryProcessMap)) {
    missing.push("primary Agent Trace process map exposes debug vocabulary outside Trace details");
  }
  if (/\b(?:SAP OData|Supabase|Source-backed|sourceTrustLabel|sourceTransportLabel|formatTraceRetrievalSourceLabel|formatTraceTransportLabel)\b/u.test(primaryProcessMap)) {
    missing.push("primary Agent Trace process map exposes source/plumbing labels outside Trace details");
  }
  if (/\b(?:node\.recordIds\.length|node\.citations\.length)\b/u.test(primaryProcessMap)) {
    missing.push("primary Agent Trace process map renders separate record/citation plumbing counts");
  }
  if (!/\bformatPrimaryProcessNodeLabel\s*\(\s*node\s*\)/u.test(primaryProcessMap)) {
    missing.push("primary Agent Trace process map does not use a business-readable node label formatter");
  }
  if (!/\bformatPrimaryProcessNodeMessage\s*\(\s*node\s*\)/u.test(primaryProcessMap)) {
    missing.push("primary Agent Trace process map does not use a business-readable node message formatter");
  }
  if (!/\bformatPrimaryProcessNodePhaseLabel\s*\(\s*node\s*\)/u.test(primaryProcessMap)) {
    missing.push("primary Agent Trace process map does not use a business-readable phase label formatter");
  }

  const primaryLabelFormatter = findFunctionDefinition(stripComments(source), "formatPrimaryProcessNodeLabel");
  const primaryPhaseFormatter = findFunctionDefinition(stripComments(source), "formatPrimaryProcessNodePhaseLabel");
  const formatterText = `${primaryLabelFormatter?.body ?? ""}\n${primaryPhaseFormatter?.body ?? ""}`;
  if (/\b(?:sap|supabase|sourceKind|retrievalSource|agent_tool_start|agent_tool_end|OpenAI Agents SDK)\b/iu.test(formatterText)) {
    missing.push("primary Agent Trace formatters derive business labels from source/debug plumbing");
  }
  for (const label of ["Scope", "Retrieve", "Reason", "Draft/Handoff", "Cited answer"]) {
    if (!formatterText.includes(label)) {
      missing.push(`primary Agent Trace formatter missing business phase label ${label}`);
    }
  }

  const compactMessageFormatterText = [
    findFunctionDefinition(stripComments(source), "compactEvidenceDocumentProcessMessage")?.body ?? "",
    findFunctionDefinition(stripComments(source), "compactCitationProcessMessage")?.body ?? ""
  ].join("\n");
  if (/\b(?:sourceLabel|SAP OData|Supabase|Source-backed|formatRecordCount|recordIds\.length)\b/u.test(compactMessageFormatterText)) {
    missing.push("compact process node messages still carry source labels or plumbing counts");
  }

  return missing;
}

function missingTraceDetailsModelExecutionRequirements(source: string): string[] {
  const stripped = stripComments(source);
  const traceDetailsIndex = stripped.indexOf('data-testid="maya-agent-trace-details"');
  const traceDetails = traceDetailsIndex === -1 ? "" : stripped.slice(traceDetailsIndex);
  const missing: string[] = [];

  if (traceDetails.length === 0) {
    missing.push("Trace details source could not be isolated");
    return missing;
  }
  if (!/response\.modelExecution/u.test(traceDetails)) {
    missing.push("Trace details do not render response.modelExecution");
  }
  for (const field of ["mode", "agentNames", "handoffCount", "rawModelTextPolicy", "deterministicBasis", "reason", "tokenUsage"]) {
    if (!new RegExp(`\\b${field}\\b`, "u").test(traceDetails)) {
      missing.push(`Trace details do not preserve modelExecution.${field}`);
    }
  }
  if (!/data-testid="maya-agent-model-execution-details"/u.test(traceDetails)) {
    missing.push("Trace details are missing stable model execution proof hook");
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

function extractMayaOverviewSource(surface: string): string {
  const stripped = stripComments(surface);
  const overviewCaseIndex = stripped.indexOf('case "overview":');
  const worklistCaseIndex = stripped.indexOf('case "worklist":', overviewCaseIndex);
  if (overviewCaseIndex < 0 || worklistCaseIndex < 0) {
    return "";
  }

  const overviewSetupIndex = stripped.lastIndexOf("const validDeductionCount = model.worklist", overviewCaseIndex);
  const startIndex = overviewSetupIndex >= 0 ? overviewSetupIndex : overviewCaseIndex;

  return stripped.slice(startIndex, worklistCaseIndex);
}

describe("Maya shadcn human QA contract", () => {
  it("requires the Maya shadcn route to show an honest loading shell during cold server streams", () => {
    const loadingPath = "cockpit/app/forensics/shadcn/loading.tsx";
    const loadingShellPath = "cockpit/components/maya/maya-shadcn-loading-shell.tsx";

    expect(existsSync(loadingPath)).toBe(true);
    expect(existsSync(loadingShellPath)).toBe(true);
    const loading = read(loadingPath);
    const loadingShell = read(loadingShellPath);

    expect(loading).toContain("MayaShadcnLoadingShell");
    expect(loadingShell).toContain('data-testid="maya-shadcn-loading-shell"');
    expect(loadingShell).toContain('aria-busy="true"');
    expect(loadingShell).toContain("Connecting workspace");
    expect(loadingShell).not.toMatch(/\$[0-9]/u);
    expect(loadingShell).not.toMatch(/\bS[0-9]+-L[0-9]+\b/u);
    expect(loadingShell).not.toMatch(/\b(?:Crestline|Greenleaf|ValuMart|Harbor)\b/u);
    expect(loadingShell).not.toMatch(/\b(?:Connected|Proxy - Supabase|Status unavailable|Probe failed|Refresh overdue)\b/u);
  });

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

  it("requires production login/session controls instead of visible persona choices", () => {
    const loginForm = stripComments(read("cockpit/app/login/login-form.tsx"));
    const workspaceShell = stripComments(readMayaComponent("maya-workspace-shell.tsx"));
    const contextAround = (pattern: RegExp): string[] =>
      Array.from(loginForm.matchAll(pattern), (match) => {
        const index = match.index;
        return loginForm.slice(Math.max(0, index - 500), Math.min(loginForm.length, index + match[0].length + 1_200));
      });
    const isDevOrHiddenPersonaContext = (context: string): boolean =>
      /\b(?:dev-only|demo-only|developer-only|debug-only|hidden|sr-only|aria-hidden|NODE_ENV|RECOUP_ENABLE_DEV_PERSONA|showDevPersonaSwitcher|showDemoPersonaSwitcher|devPersonaSwitcher)\b/iu.test(
        context
      );
    const normalVisiblePersonaFieldLabels = contextAround(/<FieldLabel(?:\s[^>]*)?>\s*Persona\s*<\/FieldLabel>/gu).filter(
      (context) => !isDevOrHiddenPersonaContext(context)
    );
    const normalVisiblePersonaAriaLabels = contextAround(/\baria-label\s*=\s*(?:"Persona"|'Persona')/gu).filter(
      (context) => !isDevOrHiddenPersonaContext(context)
    );
    const normalVisiblePersonaChoiceLabels = contextAround(
      /<ToggleGroupItem\b[\s\S]{0,1000}\{\s*persona\.(?:displayName|label|loginId|persona)\s*\}[\s\S]{0,240}<\/ToggleGroupItem>/gu
    ).filter((context) => !isDevOrHiddenPersonaContext(context));

    expect({
      normalVisiblePersonaAriaLabelCount: normalVisiblePersonaAriaLabels.length,
      normalVisiblePersonaChoiceLabelCount: normalVisiblePersonaChoiceLabels.length,
      normalVisiblePersonaFieldLabelCount: normalVisiblePersonaFieldLabels.length,
      workspaceExposesLogoutRouteOrComponent: /\b(?:demo-logout|LogoutButton|logout-button)\b/iu.test(workspaceShell),
      workspaceExposesSignOutText: /\bSign out\b/u.test(workspaceShell),
      loginDoesNotDefaultToPersonaId: !/\b(?:preferredLoginId|useState\s*\(\s*defaultLoginId\s*\))/u.test(loginForm)
    }).toEqual({
      normalVisiblePersonaAriaLabelCount: 0,
      normalVisiblePersonaChoiceLabelCount: 0,
      normalVisiblePersonaFieldLabelCount: 0,
      loginDoesNotDefaultToPersonaId: true,
      workspaceExposesLogoutRouteOrComponent: true,
      workspaceExposesSignOutText: true
    });
  });

  it("requires Task 8 login layout to use a single centered login card and static workspace chip", () => {
    const loginPage = stripComments(read("cockpit/app/login/page.tsx"));
    const loginForm = stripComments(read("cockpit/app/login/login-form.tsx"));
    const workspaceChipContext = jsxDataTestIdContext(loginForm, "maya-login-workspace-chip", 900);
    const passwordGroupContext = jsxDataTestIdContext(loginForm, "maya-login-password-group", 900);

    expect({
      loginCardHook: hasJsxDataTestId(loginPage, "maya-login-card"),
      contextPanelRemoved: !hasJsxDataTestId(loginPage, "maya-login-context-panel"),
      loginGridAvoidsPeerContextColumn: !/\blg:grid-cols-\[minmax\(0,500px\)_minmax\(320px,1fr\)\]/u.test(loginPage),
      loginPageDoesNotRenderAssuranceCards: !/\bLoginAssuranceItem\b/u.test(loginPage),
      workspaceChipHook: hasJsxDataTestId(loginForm, "maya-login-workspace-chip"),
      workspaceChipUsesStaticContainer:
        /<div\b(?=[^>]*\bdata-testid="maya-login-workspace-chip")(?=[^>]*\baria-label="Workspace Forensics")/u.test(
          loginForm
        ) &&
        !/<(?:InputGroup|InputGroupInput|Input)\b(?=[^>]*\bdata-testid="maya-login-workspace-chip")|<input\b(?=[^>]*\bdata-testid="maya-login-workspace-chip")|\brole=["']searchbox["']|\btype=["']search["']/u.test(
          workspaceChipContext
        ),
      workspaceChipUsesBusinessIcon:
        /\b(?:ShieldCheckIcon|BriefcaseBusinessIcon|Building2Icon)\b/u.test(workspaceChipContext),
      workspaceChipDoesNotUseSearchIcon: workspaceChipContext.length > 0 && !/\bSearchIcon\b/u.test(workspaceChipContext),
      loginFormDoesNotImportSearchIcon: !/\bSearchIcon\b/u.test(loginForm),
      passwordFocusHook: hasJsxDataTestId(loginForm, "maya-login-password-group"),
      passwordFocusIsScopedAndSubtle:
        passwordGroupContext.length > 0 &&
        /\bhas-\[\[data-slot=input-group-control\]:focus-visible\]:ring-1\b/u.test(passwordGroupContext) &&
        /\bhas-\[\[data-slot=input-group-control\]:focus-visible\]:ring-ring\/20\b/u.test(passwordGroupContext),
      passwordFocusAvoidsBroadRing:
        passwordGroupContext.length > 0 && !/\bhas-\[\[data-slot=input-group-control\]:focus-visible\]:ring-3\b/u.test(passwordGroupContext)
    }).toEqual({
      contextPanelRemoved: true,
      loginCardHook: true,
      loginGridAvoidsPeerContextColumn: true,
      loginFormDoesNotImportSearchIcon: true,
      loginPageDoesNotRenderAssuranceCards: true,
      passwordFocusAvoidsBroadRing: true,
      passwordFocusHook: true,
      passwordFocusIsScopedAndSubtle: true,
      workspaceChipDoesNotUseSearchIcon: true,
      workspaceChipHook: true,
      workspaceChipUsesBusinessIcon: true,
      workspaceChipUsesStaticContainer: true
    });
  });

  it("requires case detail line selection to use accessible Line 1 and Line 2 controls", () => {
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const workspace = stripComments(readMayaComponent("deduction-case-workspace.tsx"));
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");

    expect({
      e2eCallsLineSelectorContract: e2e.includes("await assertCaseLineSelectorControls(page, apiServer, detail, connectorsModel);"),
      e2eClicksHumanLineButton:
        /\bgetByRole\s*\(\s*["']button["']\s*,\s*\{\s*name:\s*new RegExp\s*\(\s*`\^Line \$\{String\(index \+ 1\)\}\$`/u.test(
          e2e
        ),
      e2eVerifiesSecondLineBackendDetail:
        /const\s+secondLineDetail\s*=\s*await\s+switchToBackendCaseLine\(page,\s*apiServer,\s*lineIds,\s*secondLineId,\s*1\)/u.test(e2e) &&
        /assertSelectedCaseLineOverviewMatchesBackend\(page,\s*lineIds,\s*secondLineDetail,\s*1\)/u.test(e2e) &&
        /assertAgentProcessMapBeforeQuery\(page,\s*secondLineDetail,\s*connectorsModel\)/u.test(e2e) &&
        /assertRenderedEvidenceDossierMatchesBackend\(page,\s*secondLineDetail,\s*connectorsModel\)/u.test(e2e) &&
        /assertRenderedQueryDockMatchesBackend\(page,\s*secondLineDetail\)/u.test(e2e) &&
        /assertRenderedRecoveryDraftMatchesBackend\(page,\s*secondLineDetail\)/u.test(e2e) &&
        /assertRenderedApprovalGateMatchesBackend\(page,\s*secondLineDetail\)/u.test(e2e) &&
        /assertRenderedAuditConfirmationMatchesBackend\(page,\s*secondLineDetail\)/u.test(e2e) &&
        /const\s+thirdLineDetail\s*=\s*await\s+switchToBackendCaseLine\(page,\s*apiServer,\s*lineIds,\s*thirdLineId,\s*2\)/u.test(e2e) &&
        /assertObservedRealBackendCall\s*\(\s*apiServer,\s*["']GET["']\s*,\s*`\/forensics\/work-items\/\$\{encodeURIComponent\(lineId\)\}`\s*\)/u.test(e2e),
      e2eRequiresSelectedLineHook: e2e.includes('page.getByTestId("maya-selected-line-label")'),
      lineSelectorHasGroupLabel: /aria-label=["']Deduction lines["']|aria-label=["']Line selector["']/u.test(workspace),
      lineSelectorCallsBackendDetailHandler:
        /\bonSelectLine\b/u.test(workspace) &&
        /\bonClick=\{\(\)\s*=>\s*\{\s*onSelectLine\(lineId\);\s*\}\}/u.test(workspace),
      lineSelectorDoesNotUseDisplayOnlyState:
        !/\bdisplayLineId\b/u.test(workspace) && !/\bsetDisplayLineId\b/u.test(workspace),
      lineSelectorUsesPressedState: /\baria-pressed\s*=\s*\{\s*lineId\s*===\s*selected\.lineId\s*\}/u.test(workspace),
      lineSelectorRendersButtons:
        /selectedWorklistItem\?\.lineIds\.map\(\(lineId,\s*index\)[\s\S]{0,1200}<button\b[\s\S]{0,500}Line\s*\{String\(index \+ 1\)\}/u.test(
          workspace
        ) ||
        /selectedWorklistItem\?\.lineIds\.map\(\(lineId,\s*index\)[\s\S]{0,1200}<Button\b[\s\S]{0,500}Line\s*\{String\(index \+ 1\)\}/u.test(
          workspace
        ),
      rawLineIdsAreNotPrimaryBadgeControls:
        !/aria-label="Opened work item line IDs"[\s\S]{0,1400}<Badge\b[\s\S]{0,300}\{lineId\}/u.test(workspace),
      surfaceAllowsSiblingLineDetails:
        /openedCaseWorklistItem\.lineIds\.includes\(openedCaseDetail\.lineId\)/u.test(surface) &&
        /assertWorkItemDetailIdentity\s*\(\s*detail\s*,\s*requestedLineId/u.test(surface),
      surfacePassesLineSelectionHandler:
        /<DeductionCaseWorkspace\b[\s\S]{0,1600}\bonSelectLine=\{handleSelectCaseLine\}/u.test(surface),
      selectedLineLabelHook: hasJsxDataTestId(workspace, "maya-selected-line-label")
    }).toEqual({
      e2eCallsLineSelectorContract: true,
      e2eClicksHumanLineButton: true,
      e2eVerifiesSecondLineBackendDetail: true,
      e2eRequiresSelectedLineHook: true,
      lineSelectorHasGroupLabel: true,
      lineSelectorCallsBackendDetailHandler: true,
      lineSelectorDoesNotUseDisplayOnlyState: true,
      lineSelectorUsesPressedState: true,
      lineSelectorRendersButtons: true,
      rawLineIdsAreNotPrimaryBadgeControls: true,
      surfaceAllowsSiblingLineDetails: true,
      surfacePassesLineSelectionHandler: true,
      selectedLineLabelHook: true
    });
  });

  it("keeps raw Maya record IDs and line IDs behind disclosure controls", () => {
    const rawIdComponentFiles = [
      "deduction-case-workspace.tsx",
      "recovery-draft-review.tsx",
      "approval-gate-dialog.tsx",
      "audit-confirmation-panel.tsx",
      "cited-answer-card.tsx"
    ] as const;
    const primarySources = rawIdComponentFiles.map((fileName) => ({
      path: `cockpit/components/maya/${fileName}`,
      source: primaryMayaSource(readMayaComponent(fileName))
    }));
    const workspace = stripComments(readMayaComponent("deduction-case-workspace.tsx"));
    const draft = stripComments(readMayaComponent("recovery-draft-review.tsx"));
    const approval = stripComments(readMayaComponent("approval-gate-dialog.tsx"));
    const audit = stripComments(readMayaComponent("audit-confirmation-panel.tsx"));
    const citedAnswer = stripComments(readMayaComponent("cited-answer-card.tsx"));
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");

    expect({
      primaryRecordIdStripLines: matchingLines(primarySources, /<RecordIdStrip\b/u),
      primaryMappedRecordBadgeLines: matchingLines(primarySources, /\brecordIds\.map\(\(recordId\)[\s\S]{0,420}<Badge\b/u),
      primaryLineIdSubtextLines: matchingLines(
        primarySources,
        /(?:Line metadata:\s*\{displayLineId\}|<span\b[^>]*>\s*\{lineId\}\s*<\/span>|\bvalue=\{selectedLineId\}|\bvalue=\{item\.lineId\})/u
      ),
      caseLineSourceDetailsHook: workspace.includes('"maya-case-line-source-details"'),
      caseBasisSourceDetailsHook: workspace.includes('"maya-case-basis-source-details"'),
      caseTimelineSourceDetailsHook: workspace.includes('"maya-case-timeline-source-details"'),
      draftSourceDetailsHook: draft.includes('"maya-draft-source-details"'),
      draftRailSourceDetailsHook: draft.includes('"maya-draft-rail-source-details"'),
      approvalSourceDetailsHook: hasJsxDataTestId(approval, "maya-approval-source-details"),
      auditSelectedActionSourceDetailsHook: hasJsxDataTestId(audit, "maya-audit-selected-action-source-details"),
      citedBlockedSourceDetailsHook: hasJsxDataTestId(citedAnswer, "maya-cited-blocked-source-details"),
      e2eRequiresCaseLineDisclosure: e2e.includes('"maya-case-line-source-details"'),
      e2eRequiresDraftSourceDisclosure: e2e.includes('"maya-draft-source-details"'),
      e2eRequiresApprovalSourceDisclosure: e2e.includes('"maya-approval-source-details"'),
      e2eRequiresAuditActionDisclosure: e2e.includes('"maya-audit-selected-action-source-details"')
    }).toEqual({
      primaryRecordIdStripLines: [],
      primaryMappedRecordBadgeLines: [],
      primaryLineIdSubtextLines: [],
      caseLineSourceDetailsHook: true,
      caseBasisSourceDetailsHook: true,
      caseTimelineSourceDetailsHook: true,
      draftSourceDetailsHook: true,
      draftRailSourceDetailsHook: true,
      approvalSourceDetailsHook: true,
      auditSelectedActionSourceDetailsHook: true,
      citedBlockedSourceDetailsHook: true,
      e2eRequiresCaseLineDisclosure: true,
      e2eRequiresDraftSourceDisclosure: true,
      e2eRequiresApprovalSourceDisclosure: true,
      e2eRequiresAuditActionDisclosure: true
    });
  });

  it("requires a logged-in Recoup Agent launcher to open the grounded query dock", () => {
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const workspace = stripComments(readMayaComponent("deduction-case-workspace.tsx"));
    const e2e = read("tests/e2e/cockpit-premium-e2e.ts");
    const styles = read("cockpit/app/styles.css");

    expect({
      launcherHook: hasJsxDataTestId(surface, "recoup-agent-launcher"),
      launcherUsesLineScopedIntent:
        /\bagentDockOpenLineId\b/u.test(surface) &&
        /\bopenQueryDockLineId\b/u.test(workspace) &&
        /\bopenQueryDockLineId\s*!==\s*selected\.lineId\b/u.test(workspace),
      launcherIntentIsConsumable: /\bonQueryDockIntentConsumed\b/u.test(surface) && /\bonQueryDockIntentConsumed\?\.\(\s*\)/u.test(workspace),
      rowSelectionClearsLauncherIntent: /function handleSelectWorklistItem|const handleSelectWorklistItem/u.test(surface)
        ? /handleSelectWorklistItem[\s\S]{0,500}\bsetAgentDockOpenLineId\(undefined\)/u.test(surface)
        : false,
      normalOpenClearsLauncherIntent:
        /\bopenInvestigationForItem[\s\S]{0,700}\bopenQueryDockOnReady[\s\S]{0,700}\bsetAgentDockOpenLineId\(undefined\)/u.test(surface),
      failedDetailLoadClearsLauncherIntent:
        /\bcatch \(error\)[\s\S]{0,500}\bsetAgentDockOpenLineId\(undefined\)/u.test(surface),
      launcherDoesNotCreateSeparateQueryDock: !/<QueryEvidenceDock\b/u.test(surface) && /<QueryEvidenceDock\b/u.test(workspace),
      launcherUsesFloatingShell:
        surface.includes("maya-recoup-agent-float") && surface.includes("maya-recoup-agent-button"),
      e2eClicksLauncher: e2e.includes('page.getByTestId("recoup-agent-launcher").click()'),
      e2eChecksFloatingPosition: e2e.includes("Recoup Agent launcher must sit on the bottom-right rail below overview rows"),
      cssPinsLauncherLowerRight:
        styles.includes("right: max(1rem, env(safe-area-inset-right));") &&
        styles.includes("bottom: max(1rem, env(safe-area-inset-bottom));") &&
        !styles.includes("top: 50vh;") &&
        !styles.includes("top: 55vh;") &&
        !styles.includes("transform: translateY(-50%);") &&
        !styles.includes("left: max(1rem, env(safe-area-inset-left));") &&
        !styles.includes("left: calc(var(--sidebar-width) + 1rem);"),
      e2eCoversNoReplayAfterNormalOpen: e2e.includes("Recoup Agent launcher signal must not replay"),
      e2eVerifiesGroundedDock: e2e.includes('data-testid="maya-query-dock"') && e2e.includes("Recoup Agent launcher")
    }).toEqual({
      launcherHook: true,
      launcherUsesLineScopedIntent: true,
      launcherIntentIsConsumable: true,
      rowSelectionClearsLauncherIntent: true,
      normalOpenClearsLauncherIntent: true,
      failedDetailLoadClearsLauncherIntent: true,
      launcherDoesNotCreateSeparateQueryDock: true,
      launcherUsesFloatingShell: true,
      e2eClicksLauncher: true,
      e2eChecksFloatingPosition: true,
      cssPinsLauncherLowerRight: true,
      e2eCoversNoReplayAfterNormalOpen: true,
      e2eVerifiesGroundedDock: true
    });
  });

  it("requires static status badges to be non-button spans while actions stay buttons", () => {
    const files = [
      { path: "cockpit/components/maya/deduction-case-workspace.tsx", source: stripComments(readMayaComponent("deduction-case-workspace.tsx")) },
      { path: "cockpit/components/maya/deduction-worklist-table.tsx", source: stripComments(readMayaComponent("deduction-worklist-table.tsx")) },
      { path: "cockpit/components/maya/maya-forensics-surface.tsx", source: stripComments(readMayaComponent("maya-forensics-surface.tsx")) },
      { path: "cockpit/components/maya/recommended-action-cell.tsx", source: stripComments(readMayaComponent("recommended-action-cell.tsx")) }
    ] as const satisfies readonly SourceFile[];
    const combined = files.map((file) => file.source).join("\n");
    const staticBadgeElements = files.flatMap((file) =>
      Array.from(
        file.source.matchAll(
          /<([A-Za-z][\w.:]*)\b[^>]*\bdata-testid\s*=\s*(?:"maya-static-status-badge"|'maya-static-status-badge'|\{\s*["']maya-static-status-badge["']\s*\})[^>]*>/gu
        ),
        (match) => ({
          openingTag: match[0],
          path: file.path,
          tagName: match[1] ?? ""
        })
      )
    );
    const staticBadgePointerSemanticsPattern =
      /(?:\brole\s*=\s*(?:"button"|'button'|\{\s*(?:["'`]button["'`]|[^}]*button[^}]*)\s*\})|\bcursor-pointer\b|\b(?:onClick|onKeyDown|onPointer\w+|onMouse\w+)\s*=|\btabIndex\s*=\s*(?:"(?:0|[1-9]\d*)"|'(?:0|[1-9]\d*)'|\{\s*(?:["'`](?:0|[1-9]\d*)["'`]|\+?(?:0|[1-9]\d*))\s*\}))/iu;
    const staticBadgePointerSemanticsFixtures = [
      '<span data-testid="maya-static-status-badge" role="button">',
      '<span data-testid="maya-static-status-badge" role={buttonRole}>',
      '<span data-testid="maya-static-status-badge" role={"button"}>',
      '<span data-testid="maya-static-status-badge" className="cursor-pointer">',
      '<span data-testid="maya-static-status-badge" onClick={handleClick}>',
      '<span data-testid="maya-static-status-badge" onKeyDown={handleKeyDown}>',
      '<span data-testid="maya-static-status-badge" onPointerDown={handlePointerDown}>',
      '<span data-testid="maya-static-status-badge" onMouseEnter={handleMouseEnter}>',
      '<span data-testid="maya-static-status-badge" tabIndex={0}>',
      '<span data-testid="maya-static-status-badge" tabIndex="1">',
      '<span data-testid="maya-static-status-badge" tabIndex={"0"}>'
    ];
    const staticBadgeNonPointerSemanticsFixtures = [
      '<span data-testid="maya-static-status-badge">',
      '<span data-testid="maya-static-status-badge" role="status">',
      '<span data-testid="maya-static-status-badge" tabIndex={-1}>',
      '<span data-testid="maya-static-status-badge" className="status-badge">'
    ];

    expect({
      actionsRenderAsButtons:
        /<Button\b[\s\S]{0,700}>\s*<[^>]+>\s*Open investigation\s*<\/Button>/u.test(combined) ||
        /<Button\b[\s\S]{0,700}\bOpen investigation\b[\s\S]{0,160}<\/Button>/u.test(combined),
      staticBadgeHookCountAtLeastOne: staticBadgeElements.length >= 1,
      staticBadgeHooksAreNonButtonSpans: staticBadgeElements.every((element) => element.tagName === "span"),
      staticBadgeHooksHaveNoPointerSemantics: staticBadgeElements.every(
        (element) => !staticBadgePointerSemanticsPattern.test(element.openingTag)
      ),
      staticBadgeNonPointerSemanticsFixturesAreAccepted: staticBadgeNonPointerSemanticsFixtures.every(
        (openingTag) => !staticBadgePointerSemanticsPattern.test(openingTag)
      ),
      staticBadgePointerSemanticsFixturesAreRejected: staticBadgePointerSemanticsFixtures.every((openingTag) =>
        staticBadgePointerSemanticsPattern.test(openingTag)
      )
    }).toEqual({
      actionsRenderAsButtons: true,
      staticBadgeHookCountAtLeastOne: true,
      staticBadgeHooksAreNonButtonSpans: true,
      staticBadgeHooksHaveNoPointerSemantics: true,
      staticBadgeNonPointerSemanticsFixturesAreAccepted: true,
      staticBadgePointerSemanticsFixturesAreRejected: true
    });
  });

  it("requires prebuilt prompt chips and backend-tied conversational user/assistant turns in the query dock", () => {
    const queryDock = readMayaComponent("query-evidence-dock.tsx");
    const citedAnswer = readMayaComponent("cited-answer-card.tsx");
    const cockpitData = read("cockpit/app/cockpit-data.ts");
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const premiumE2e = read("tests/e2e/cockpit-premium-e2e.ts");
    const styles = read("cockpit/app/styles.css");
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
      ) || /\bdedupePromptSuggestions\(dock\.promptSuggestions\s*\?\?\s*\[\]\)/u.test(stripComments(queryDock)),
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
      citedAnswerTextUsesRedactedDisplay:
        /\bfunction\s+displayAnswerWithoutInlineRecordIds\b/u.test(citedAnswer) &&
        /data-testid="maya-cited-answer-text"[\s\S]{0,180}\bdisplayAnswerWithoutInlineRecordIds\(response\.answer,\s*response\.recordIds\)/u.test(
          citedAnswer
        ),
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
      composerRemainsAvailableAfterAnswer:
        !/\bconst\s+shouldShowComposer\b/u.test(stripComments(queryDock)) &&
        !/data-testid="maya-query-input"[\s\S]{0,900}\bcanShowCitedAnswer\b/u.test(stripComments(queryDock)) &&
        !/disabled=\{canShowCitedAnswer\s*\|\|/u.test(stripComments(queryDock)),
      promptChipLabelsUseQuestionText:
        /data-testid="maya-query-prompt-chip"[\s\S]{0,360}\{prompt\.question\}/u.test(stripComments(queryDock)) &&
        !/data-testid="maya-query-prompt-chip"[\s\S]{0,360}\{prompt\.label\}/u.test(stripComments(queryDock)),
      promptChipListIsDeduped:
        (/\b(?:dedupedPromptSuggestions|uniquePromptSuggestions)\b/u.test(stripComments(queryDock)) ||
          /\bdedupePromptSuggestions\b/u.test(stripComments(queryDock))) &&
        /\bnew\s+Set\s*<\s*string\s*>\s*/u.test(stripComments(queryDock)),
      assistantMessageHookTargetsAnswerBubble: assistantMessageHookTargetsAnswerBubble(queryDock),
      assistantTurnRendersBackendAnswer: jsxDataTestIdContextHas(
        queryDock,
        "maya-query-assistant-message",
        /\b(?:snapshot|response)\.answer\b/u
      ),
      assistantBasisPrimaryUsesTraceDetailsFallback:
        /Basis available in trace details/u.test(queryDock) &&
        /data-testid="maya-cited-answer-basis"[\s\S]{0,900}\bresponse\.deterministicBasis\b/u.test(citedAnswer),
      missingAssistantCitationRequirements: missingAssistantCitationRequirements(chatSource),
      noSpanishReadyPrimaryCopy: !/Spanish ready/u.test(queryDock),
      noRunningTracePanelInPrimaryLayer: !/isRunning\s*\?\s*\([\s\S]{0,900}<AgentTracePanel/u.test(stripComments(queryDock)),
      runningBubbleUsesEvidenceCheckingCopy: /Maya is checking evidence/u.test(queryDock),
      modernChatStyles:
        styles.includes('[data-testid="maya-query-conversation"]') &&
        styles.includes('[data-testid="maya-submitted-query"]') &&
        styles.includes('[data-testid="maya-query-assistant-message"]') &&
        styles.includes(".maya-recoup-agent-button") &&
        styles.includes("box-shadow"),
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
      e2eCoversStopQueryParentTraceReset:
        premiumE2e.includes("assertBeat7StopQueryResetsParentTrace") &&
        premiumE2e.includes("Stop query") &&
        premiumE2e.includes("maya-case-agent-trace-tab") &&
        premiumE2e.includes("Query stopped"),
      reportStyleDrawerCopyLines: matchingLines(
        [
          { path: "cockpit/components/maya/query-evidence-dock.tsx", source: queryDock },
          { path: "cockpit/components/maya/cited-answer-card.tsx", source: citedAnswer }
        ],
        /\b(?:Answer review|Submitted query|Ready for cited query|Cited query standby|Citations required|Accepted only after|Accepted answer, deterministic basis|Read-only query\. Citations required before answer display|Backend forensic query answered with cited evidence)\b/u
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
      citedAnswerTextUsesRedactedDisplay: true,
      missingPromptChipKeyIdentityRequirements: [],
      missingPromptChipAccessibilityRequirements: [],
      missingBlockedQuerySnapshotProvenanceRequirements: [],
      missingStrictQueryResponseCallbackRequirements: [],
      missingQueryCloseResetRequirements: [],
      missingStableQueryCloseLifecycleRequirements: [],
      promptChipSelectsQuestion: true,
      userTurnRendersSubmittedQuestion: true,
      composerRemainsAvailableAfterAnswer: true,
      promptChipLabelsUseQuestionText: true,
      promptChipListIsDeduped: true,
      assistantMessageHookTargetsAnswerBubble: true,
      assistantTurnRendersBackendAnswer: true,
      assistantBasisPrimaryUsesTraceDetailsFallback: true,
      missingAssistantCitationRequirements: [],
      noSpanishReadyPrimaryCopy: true,
      noRunningTracePanelInPrimaryLayer: true,
      runningBubbleUsesEvidenceCheckingCopy: true,
      modernChatStyles: true,
      missingConversationE2eHelperContracts: [],
      e2eCoversStopQueryParentTraceReset: true,
      reportStyleDrawerCopyLines: []
    });
  });

  it("requires a nonblank symbolic agent process map before and after a Maya query", () => {
    const agentTrace = readMayaComponent("agent-trace-panel.tsx");
    const queryDock = readMayaComponent("query-evidence-dock.tsx");
    const workspace = readMayaComponent("deduction-case-workspace.tsx");
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const traceAndDock = `${agentTrace}\n${queryDock}`;
    const strippedAgentTrace = stripComments(agentTrace);
    const processMapIndex = strippedAgentTrace.indexOf('data-testid="maya-agent-process-map"');
    const processMapContext =
      processMapIndex === -1 ? "" : strippedAgentTrace.slice(Math.max(0, processMapIndex - 900), processMapIndex + 3_600);
    const compactSourceLabelFormatter = findFunctionDefinition(stripComments(agentTrace), "formatTraceRetrievalSourceLabel");

    const contract = {
      agentTraceTabHasStableHook: hasJsxDataTestId(workspace, "maya-case-agent-trace-tab"),
      traceTabPanelRendersTraceUi: traceTabPanelRendersTraceUi(workspace),
      missingTraceFragments: missingJsxTestIds(agentTrace, ["maya-agent-process-map", "maya-agent-process-node"]),
      missingTraceTimelineHook: missingJsxTestIds(agentTrace, ["maya-agent-trace-timeline"]),
      tracePanelUsesDisclosurePrimitive: /@\/components\/ui\/(?:accordion|collapsible)/u.test(agentTrace),
      missingTraceDetailsHook: missingJsxTestIds(agentTrace, ["maya-agent-trace-details"]),
      processMapUsesTimelineList: /<(?:ol|ul)\b[\s\S]{0,900}data-testid="maya-agent-process-map"/u.test(processMapContext),
      processMapUsesResponsiveTimelineGrid: /\bmd:grid-cols-2\b[\s\S]{0,220}\bxl:grid-cols-5\b/u.test(processMapContext),
      timelineHasStepOrdinal: /\bindex\s*\+\s*1\b/u.test(processMapContext),
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
      compactProcessNodesAvoidSourcePlumbingLabels:
        !/\b(?:sourceTrustLabel|sourceTransportLabel|formatTraceRetrievalSourceLabel\s*\(\s*node\s*\)|formatTraceTransportLabel\s*\(\s*node\s*\))\b/u.test(
          primaryAgentTraceProcessMapSource(agentTrace)
        ),
      compactSourceTrustLabelAvoidsRawBackendDetails:
        compactSourceLabelFormatter !== undefined &&
        !/\b(?:recordIds|citations|summary|detailMessage|deterministicBasis|hook|sourceLabel|label)\b/u.test(
          compactSourceLabelFormatter.body
        ),
      missingBusinessReadablePrimaryTraceRequirements: missingBusinessReadablePrimaryTraceRequirements(agentTrace),
      missingTraceDetailsModelExecutionRequirements: missingTraceDetailsModelExecutionRequirements(agentTrace),
      rawBackendSummaryTextRemainsBehindTraceDetails:
        /\bdetailMessage\s*:\s*(?:document\.summary|citation\.summary\b)/u.test(stripComments(agentTrace)) &&
        /data-testid="maya-agent-trace-details"[\s\S]{0,4200}\bnode\.detailMessage\b/u.test(stripComments(agentTrace)),
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
            label: "primary process map rejects visible source-backed/SAP/Supabase plumbing labels",
            pattern: /compact process map leaked primary source\/plumbing label/u
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
      missingTraceTimelineHook: [],
      tracePanelUsesDisclosurePrimitive: true,
      missingTraceDetailsHook: [],
      processMapUsesTimelineList: true,
      processMapUsesResponsiveTimelineGrid: true,
      timelineHasStepOrdinal: true,
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
      compactProcessNodesAvoidSourcePlumbingLabels: true,
      compactSourceTrustLabelAvoidsRawBackendDetails: true,
      missingBusinessReadablePrimaryTraceRequirements: [],
      missingTraceDetailsModelExecutionRequirements: [],
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

  it("keeps the Maya shadcn sidebar aligned to the production section set", () => {
    const shell = stripComments(readMayaComponent("maya-workspace-shell.tsx"));
    const e2e = read("tests/e2e/cockpit-premium-e2e.ts");
    const expectedLabels = ["Overview", "Worklist", "Cases", "Evidence", "Approvals"];
    const legacyLabels = ["Deductions", "Run trace", "Analytics", "Configuration"];
    const navItemsBlock = shell.slice(shell.indexOf("const navItems = ["), shell.indexOf("] as const;") + "] as const;".length);

    expect({
      hasExactProductionLabels: expectedLabels.every((label) => navItemsBlock.includes(`label: "${label}"`)),
      legacyLabelsPresent: legacyLabels.filter((label) => navItemsBlock.includes(label)),
      navItemCount: (navItemsBlock.match(/label:\s*"/gu) ?? []).length,
      e2eRejectsLegacySidebar: e2e.includes("Maya shadcn sidebar must not show legacy nav")
    }).toEqual({
      hasExactProductionLabels: true,
      legacyLabelsPresent: [],
      navItemCount: expectedLabels.length,
      e2eRejectsLegacySidebar: true
    });
  });

  it("requires the Maya Overview landing to expose backend-backed command hooks without local business fabrication", () => {
    const surface = readMayaComponent("maya-forensics-surface.tsx");
    const kpiStrip = readMayaComponent("maya-run-kpi-strip.tsx");
    const cockpitE2e = read("tests/e2e/cockpit-premium-e2e.ts");
    const realBackendE2e = read("tests/e2e/maya-real-backend-e2e.ts");
    const overviewSource = extractMayaOverviewSource(surface);
    const overviewHooks = [
      "maya-overview-command-center",
      "maya-overview-intelligence-grid",
      "maya-overview-source-readiness-toggle",
      "maya-overview-case-concentration-table",
      "maya-overview-case-concentration-header-row",
      "maya-overview-case-concentration-row",
      "maya-overview-case-concentration-filter",
      "maya-overview-case-concentration-sort-id",
      "maya-overview-case-concentration-sort-customer",
      "maya-overview-case-concentration-sort-lines",
      "maya-overview-case-concentration-sort-exposure"
    ] as const;
    const overviewBandHooks = [
      "maya-overview-kpi-band",
      "maya-overview-concentration-band",
      "maya-overview-system-band"
    ] as const;
    const hardcodedBusinessMetricMatches = matchingLines(
      [{ path: "cockpit/components/maya/maya-forensics-surface.tsx", source: overviewSource }],
      /\bHigh priority\b|["'`][^"'`]*\$\s?\d[\d,]*(?:\.\d{2})?[^"'`]*["'`]/u
    );
    const localAmountComputationMatches = matchingLines(
      [{ path: "cockpit/components/maya/maya-forensics-surface.tsx", source: overviewSource }],
      /\b(?:Number|parseFloat|parseInt)\s*\(|\.reduce\s*\([\s\S]{0,240}\bamount\b/u
    );
    const forbiddenFallbackRankCopyMatches = matchingLines(
      [{ path: "cockpit/components/maya/maya-forensics-surface.tsx", source: overviewSource }],
      /\bNext case\b|\bNext recommended\b|\bRecommended Next\b/u
    );

    const contract = {
      missingOverviewHooks: missingJsxTestIds(surface, overviewHooks),
      missingOverviewBandHooks: missingJsxTestIds(surface, overviewBandHooks),
      concentrationTitleHierarchy:
        /data-testid="maya-overview-concentration-title"/u.test(overviewSource) &&
        /className="text-lg font-semibold text-foreground"/u.test(overviewSource),
      caseConcentrationHeaderUsesShadedRow:
        /data-testid="maya-overview-case-concentration-header-row"/u.test(overviewSource) &&
        /className="[^"]*\bbg-muted\/70\b/u.test(overviewSource),
      kpiStripShowsNoTrendFallback: hasJsxDataTestId(kpiStrip, "maya-kpi-trend-unavailable"),
      kpiStripAvoidsFakeTrendOrDelta:
        !/\b(?:sparkline|deltaValue|trendDelta|trendSeries|seriesData)\b/u.test(kpiStrip) &&
        !/["'`][^"'`]*[+-]\d+(?:\.\d+)?%[^"'`]*["'`]/u.test(kpiStrip),
      caseConcentrationRowsOpenBackendInvestigation:
        /data-testid="maya-overview-case-concentration-row"[\s\S]{0,700}\bonClick=\{\(\) => \{[\s\S]{0,160}\bopenInvestigationForItem\(item\)/u.test(
          overviewSource
        ) &&
        /data-testid="maya-overview-case-concentration-row"[\s\S]{0,900}\bonKeyDown=\{\(event\) => \{[\s\S]{0,320}\bopenInvestigationForItem\(item\)/u.test(
          overviewSource
        ),
      caseConcentrationUsesBackendWorklist:
        /\bfilterOverviewCaseConcentrationItems\(model\.worklist,\s*overviewCaseFilter\)/u.test(overviewSource) &&
        /\bsortOverviewCaseConcentrationItems\(\s*filterOverviewCaseConcentrationItems/u.test(overviewSource),
      caseConcentrationRendersBackendRows:
        /\boverviewConcentrationItems\.map\b/u.test(overviewSource) &&
        ["lineId", "customerLabel", "scenarioLabel", "lineCount", "amount"].every((field) =>
          new RegExp(`\\bitem\\.${field}\\b`, "u").test(overviewSource)
        ),
      caseConcentrationControlsStayLocal:
        /\bsetOverviewCaseFilter\(event\.target\.value\)/u.test(overviewSource) &&
        /\bhandleOverviewCaseSort\("id"\)/u.test(overviewSource) &&
        /\bhandleOverviewCaseSort\("customer"\)/u.test(overviewSource) &&
        /\bhandleOverviewCaseSort\("lines"\)/u.test(overviewSource) &&
        /\bhandleOverviewCaseSort\("exposure"\)/u.test(overviewSource),
      sourceReadinessStartsBehindToggle:
        /data-testid="maya-overview-source-readiness-toggle"/u.test(overviewSource) &&
        /\baria-expanded=\{overviewSourceReadinessOpen\}/u.test(overviewSource) &&
        /\boverviewSourceReadinessOpen\s*\?\s*<SourceReadinessStrip\b[^>]*\bconnectors=\{connectors\}/u.test(overviewSource),
      cockpitE2eExercisesOverviewDisclosureAndTable:
        /expectNoVisibleLocator\([\s\S]{0,240}maya-source-readiness-strip/u.test(cockpitE2e) &&
        /\boverviewDirectOpenTarget\b[\s\S]{0,1200}\bmaya-overview-case-concentration-row\b[\s\S]{0,1200}\bexpectMayaCaseDetailFlow\b/u.test(
          cockpitE2e
        ) &&
        /\bmaya-overview-source-readiness-toggle\b[\s\S]{0,800}\bclick\(\)/u.test(cockpitE2e) &&
        /\bmaya-overview-case-concentration-header-row\b/u.test(cockpitE2e) &&
        /\bmaya-overview-case-concentration-sort-customer\b[\s\S]{0,800}\bclick\(\)/u.test(cockpitE2e) &&
        /\bmaya-overview-case-concentration-filter\b[\s\S]{0,800}\bfill\(/u.test(cockpitE2e),
      realBackendE2eExercisesOverviewDisclosure:
        /maya-overview-source-readiness-toggle[\s\S]{0,900}\bclick\(\)/u.test(realBackendE2e) &&
        /Maya source readiness strip must start behind Ready sources toggle/u.test(realBackendE2e),
      forbiddenFallbackRankCopyMatches,
      overviewUsesActionInbox: /\bmodel\.actionInbox\b/u.test(overviewSource),
      overviewUsesConnectorReadiness:
        /\bconnectors\.sourceTiles\b/u.test(overviewSource) && /<SourceReadinessStrip\b[^>]*\bconnectors=\{connectors\}/u.test(overviewSource),
      overviewUsesKpiStrip: /\bmodel\.kpiStrip\b/u.test(overviewSource),
      overviewUsesWorklist: /\bmodel\.worklist\b/u.test(overviewSource),
      hardcodedBusinessMetricMatches,
      localAmountComputationMatches
    };

    expect(contract).toEqual({
      missingOverviewHooks: [],
      missingOverviewBandHooks: [],
      concentrationTitleHierarchy: true,
      caseConcentrationHeaderUsesShadedRow: true,
      kpiStripShowsNoTrendFallback: true,
      kpiStripAvoidsFakeTrendOrDelta: true,
      caseConcentrationRowsOpenBackendInvestigation: true,
      caseConcentrationUsesBackendWorklist: true,
      caseConcentrationRendersBackendRows: true,
      caseConcentrationControlsStayLocal: true,
      sourceReadinessStartsBehindToggle: true,
      cockpitE2eExercisesOverviewDisclosureAndTable: true,
      realBackendE2eExercisesOverviewDisclosure: true,
      forbiddenFallbackRankCopyMatches: [],
      overviewUsesActionInbox: true,
      overviewUsesConnectorReadiness: true,
      overviewUsesKpiStrip: true,
      overviewUsesWorklist: true,
      hardcodedBusinessMetricMatches: [],
      localAmountComputationMatches: []
    });
  });

  it("requires loading and empty states to have polished QA hooks instead of blank panels", () => {
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const emptyState = stripComments(readMayaComponent("maya-empty-state.tsx"));
    const e2e = read("tests/e2e/cockpit-premium-e2e.ts");

    expect({
      detailLoadingUsesSkeleton: /\bimport\s+\{\s*Skeleton\s*\}\s+from\s+["']@\/components\/ui\/skeleton["']/u.test(surface),
      detailLoadingHasStableHook: hasJsxDataTestId(surface, "maya-work-item-detail-loading-skeleton"),
      detailLoadingHasMultipleSkeletonLines:
        (surface.match(/data-testid="maya-work-item-detail-skeleton-line"/gu) ?? []).length >= 2,
      detailIdentityMismatchFailsClosed:
        /\bfunction\s+assertWorkItemDetailIdentity\b/u.test(surface) &&
        /\bdetail\.lineId\s*!==\s*requestedLineId\b/u.test(surface) &&
        /\bdetail\.selected\.lineId\s*!==\s*requestedLineId\b/u.test(surface) &&
        /\bdetail\.recommendedAction\.lineId\s*!==\s*requestedLineId\b/u.test(surface) &&
        /\bdetail\.recoveryDraft\.actionId\s*!==\s*detail\.recommendedAction\.actionId\b/u.test(surface) &&
        /\bdetail\.selected\.draft\.actionId\s*!==\s*detail\.recoveryDraft\.actionId\b/u.test(surface) &&
        /!detail\.workItem\.lineIds\.includes\(requestedLineId\)/u.test(surface) &&
        /!item\.lineIds\.includes\(requestedLineId\)/u.test(surface) &&
        /\bdetail\.workItem\.lineId\s*!==\s*item\.lineId\b/u.test(surface) &&
        /\bassertWorkItemDetailIdentity\s*\(\s*detail\s*,\s*requestedLineId,\s*item\s*\)/u.test(surface),
      emptyStateHasStableHook: hasJsxDataTestId(emptyState, "maya-empty-state"),
      emptyStateExposesIconHook: hasJsxDataTestId(emptyState, "maya-empty-state-icon"),
      e2eChecksDetailSkeleton: e2e.includes("maya-work-item-detail-loading-skeleton")
    }).toEqual({
      detailLoadingUsesSkeleton: true,
      detailLoadingHasStableHook: true,
      detailLoadingHasMultipleSkeletonLines: true,
      detailIdentityMismatchFailsClosed: true,
      emptyStateHasStableHook: true,
      emptyStateExposesIconHook: true,
      e2eChecksDetailSkeleton: true
    });
  });

  it("requires Task 9 contextual empty states, queue headers, and actionable fail-closed detail errors", () => {
    const emptyState = stripComments(readMayaComponent("maya-empty-state.tsx"));
    const shell = stripComments(readMayaComponent("maya-workspace-shell.tsx"));
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const runKpis = stripComments(readMayaComponent("maya-run-kpi-strip.tsx"));
    const draftReview = stripComments(readMayaComponent("recovery-draft-review.tsx"));
    const e2e = read("tests/e2e/cockpit-premium-e2e.ts");
    const expectedKinds = ["worklist", "evidence", "timeline", "approval", "search", "generic"] as const;
    const kindTypeBody = /export\s+type\s+MayaEmptyStateKind\s*=\s*([^;]+);/u.exec(emptyState)?.[1] ?? "";
    const kindUnionMembers = Array.from(kindTypeBody.matchAll(/"([^"]+)"/gu), (match) => match[1] ?? "");
    const emptyStateCallSiteSources = [
      { fileName: "maya-forensics-surface.tsx", source: surface },
      { fileName: "maya-run-kpi-strip.tsx", source: runKpis },
      { fileName: "recovery-draft-review.tsx", source: draftReview }
    ] as const;
    const unkindedVisibleEmptyCallSites = emptyStateCallSiteSources.flatMap(({ fileName, source }) =>
      Array.from(source.matchAll(/<MayaEmptyState\b[\s\S]*?\/>/gu), (match) => match[0])
        .filter((callSite) => !/\bkind=/u.test(callSite))
        .map((callSite) => `${fileName}: ${callSite}`)
    );
    const displayHeadingFallback = /const\s+displayHeading\s*=\s*heading\s*\?\?\s*([^;]+);/u.exec(shell)?.[1] ?? "";
    const displaySupportFallback = /const\s+displaySupport\s*=\s*support\s*\?\?\s*([^;]+);/u.exec(shell)?.[1] ?? "";

    expect({
      missingKindUnionMembers: expectedKinds.filter((kind) => !kindUnionMembers.includes(kind)),
      emptyStateAcceptsOptionalKind: /\bkind\?:\s*MayaEmptyStateKind\b/u.test(emptyState),
      emptyStateUsesKindDataAttribute: /data-empty-kind=\{kind\}/u.test(emptyState),
      emptyStateUsesNonSingletonIconMap:
        /Record<MayaEmptyStateKind,\s*(?:LucideIcon|typeof\s+\w+)>/u.test(emptyState) &&
        expectedKinds.every((kind) => new RegExp(`${kind}:\\s*\\w+Icon`, "u").test(emptyState)) &&
        new Set(Array.from(emptyState.matchAll(/:\s*(\w+Icon)\b/gu), (match) => match[1])).size > 1,
      emptyStateDoesNotAlwaysInstantiateInboxIcon: !/<InboxIcon\b/u.test(emptyState),
      unkindedVisibleEmptyCallSites,
      shellRemovesConsumerGreeting:
        !/\bWelcome back\b/u.test(shell) && !/Here's what's happening/u.test(shell) && !/\bfirstName\b/u.test(shell),
      shellDefaultHeadingIsQueueContext:
        displayHeadingFallback.length > 0 &&
        /\b(?:queue|worklist|forensics|deduction)\b/iu.test(displayHeadingFallback) &&
        !/\bsession\.displayName\b|\bfirstName\b/u.test(displayHeadingFallback),
      shellDefaultSupportDerivesFromCounts:
        displaySupportFallback.includes("worklistCount") &&
        displaySupportFallback.includes("pendingActionCount") &&
        !/\bsession\.displayName\b|\bfirstName\b/u.test(displaySupportFallback),
      shellSupportLineOpensWorklist:
        /data-testid="maya-header-work-items-link"/u.test(shell) &&
        /aria-label="Open source-backed worklist"/u.test(shell) &&
        /onSectionChange\("worklist"\)/u.test(shell) &&
        /type="button"/u.test(shell),
      shellPreservesRunDateMetadata: /Run date unavailable/u.test(shell),
      detailErrorTitleIsSourceUnavailable: /\bSource unavailable\b/u.test(surface),
      detailErrorPrimaryUsesControlledCopy:
        /The governed detail packet is unavailable from source systems\. Retry the request or review technical details\./u.test(surface),
      detailErrorPrimaryDoesNotRenderRawMessage:
        !/<AlertDescription>[\s\S]{0,360}\bloadState\.message\b[\s\S]{0,120}<\/AlertDescription>/u.test(surface),
      detailErrorExposesRetryAction:
        /\bonRetry\b/u.test(surface) &&
        /<Button\b[\s\S]{0,420}\bonClick=\{onRetry\}[\s\S]{0,420}\bRetry\b/u.test(surface),
      detailErrorHasDisclosureHook:
        /data-testid="maya-work-item-detail-error-details"/u.test(surface) &&
        /(?:Collapsible|Accordion|<details\b)/u.test(surface),
      detailErrorKeepsCorrelationInDetails:
        /maya-work-item-detail-error-details[\s\S]{0,2600}\b(?:correlationId|Correlation)\b/u.test(surface) &&
        /maya-work-item-detail-error-details[\s\S]{0,2600}\b(?:missingSource|Missing source)\b/u.test(surface) &&
        /maya-work-item-detail-error-details[\s\S]{0,2600}\b(?:status|Status)\b/u.test(surface),
      detailErrorKeepsRawErrorOnlyInDetails:
        /maya-work-item-detail-error-details[\s\S]{0,2600}\bloadState\.message\b/u.test(surface),
      e2eCoversActionableDetailError:
        /assertMayaDetailErrorStateIsActionable/u.test(e2e) &&
        /status:\s*503/u.test(e2e) &&
        /missingSource/u.test(e2e) &&
        /correlationId/u.test(e2e) &&
        /maya-work-item-detail-error-details/u.test(e2e)
    }).toEqual({
      detailErrorExposesRetryAction: true,
      detailErrorHasDisclosureHook: true,
      detailErrorKeepsCorrelationInDetails: true,
      detailErrorKeepsRawErrorOnlyInDetails: true,
      detailErrorPrimaryDoesNotRenderRawMessage: true,
      detailErrorPrimaryUsesControlledCopy: true,
      detailErrorTitleIsSourceUnavailable: true,
      e2eCoversActionableDetailError: true,
      emptyStateAcceptsOptionalKind: true,
      emptyStateDoesNotAlwaysInstantiateInboxIcon: true,
      emptyStateUsesKindDataAttribute: true,
      emptyStateUsesNonSingletonIconMap: true,
      shellDefaultHeadingIsQueueContext: true,
      shellDefaultSupportDerivesFromCounts: true,
      shellSupportLineOpensWorklist: true,
      shellPreservesRunDateMetadata: true,
      shellRemovesConsumerGreeting: true,
      missingKindUnionMembers: [],
      unkindedVisibleEmptyCallSites: []
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

  it("rejects the external UX audit inventory of visible inert Maya controls", () => {
    const login = stripComments(read("cockpit/app/login/login-form.tsx"));
    const shell = stripComments(readMayaComponent("maya-workspace-shell.tsx"));
    const evidence = stripComments(readMayaComponent("evidence-dossier.tsx"));
    const audit = stripComments(readMayaComponent("audit-confirmation-panel.tsx"));
    const worklist = stripComments(readMayaComponent("deduction-worklist-table.tsx"));
    const draft = stripComments(readMayaComponent("recovery-draft-review.tsx"));

    const inertControlInventory = [
      {
        control: "Forgot password?",
        match: /<Button\b(?=[\s\S]{0,260}\bdisabled\b)[\s\S]{0,420}\bForgot password\?/u.test(login)
      },
      {
        control: "Header Refresh",
        match: /<Button\b(?=[\s\S]{0,260}\bdisabled\b)[\s\S]{0,420}\bRefresh\b/u.test(shell)
      },
      {
        control: "Evidence Filter",
        match: /<Button\b(?=[\s\S]{0,260}\bdisabled\b)[\s\S]{0,420}\bFilter\b/u.test(evidence)
      },
      {
        control: "Evidence View options",
        match: /<Button\b(?=[\s\S]{0,260}\bdisabled\b)[\s\S]{0,420}\bView options\b/u.test(evidence)
      },
      {
        control: "View audit trail",
        match: /<Button\b(?=[\s\S]{0,260}\bdisabled\b)[\s\S]{0,420}\bView audit trail\b/u.test(audit)
      },
      {
        control: "Deep evidence switching requires backend support",
        match: /<DropdownMenuItem\b(?=[\s\S]{0,160}\bdisabled\b)[\s\S]{0,260}\bDeep evidence switching requires backend support\b/u.test(
          worklist
        )
      },
      {
        control: "Draft Request changes no-op",
        match: /\bsetCommandIntent\(\s*"request-changes"\s*\)[\s\S]{0,500}\bRequest changes\b/u.test(draft)
      },
      {
        control: "Draft Reject draft no-op",
        match: /\bsetCommandIntent\(\s*"reject"\s*\)[\s\S]{0,500}\bReject draft\b/u.test(draft)
      },
      {
        control: "Header notification static control styling",
        match: /aria-label=\{`\$\{pendingActionCount\.toString\(\)\} pending human actions`\}[\s\S]{0,260}\b(?:rounded-md|border|bg-background)\b/u.test(
          shell
        )
      }
    ];

    expect(inertControlInventory.filter((entry) => entry.match).map((entry) => entry.control)).toEqual([]);
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
  }, 15_000);

  it("requires evidence to lead with business document groups while raw IDs stay in source details", () => {
    const evidence = stripComments(readMayaComponent("evidence-dossier.tsx"));
    const e2e = read("tests/e2e/cockpit-premium-e2e.ts");

    expect({
      businessDocumentLabelHelper: /\bfunction\s+getEvidenceBusinessLabel\b/u.test(evidence),
      businessDocumentGroupsRendered:
        hasJsxDataTestId(evidence, "maya-evidence-business-group") &&
        /\bgroupEvidenceDocumentsByBusinessLabel\b/u.test(evidence),
      backendPacketCopyRemoved: !/\bBackend evidence packet\b/u.test(evidence),
      rawRecordStripMovedToDetails:
        hasJsxDataTestId(evidence, "maya-evidence-source-details") &&
        /<Collapsible\b[\s\S]{0,1600}<RecordIdStrip\b/u.test(evidence),
      primaryDescriptionAvoidsRawIds: !/\bCited documents and record IDs from the selected backend packet\b/u.test(evidence),
      e2eOpensSourceDetailsBeforeRawIdCheck:
        /maya-evidence-source-details[\s\S]{0,2000}\.click\s*\(/u.test(e2e) &&
        /\brecordBadges\.includes\(recordId\)/u.test(e2e)
    }).toEqual({
      businessDocumentLabelHelper: true,
      businessDocumentGroupsRendered: true,
      backendPacketCopyRemoved: true,
      rawRecordStripMovedToDetails: true,
      primaryDescriptionAvoidsRawIds: true,
      e2eOpensSourceDetailsBeforeRawIdCheck: true
    });
  });

  it("requires the Audit tab to keep receipt rows behind an expandable proof-details control", () => {
    const auditPanel = stripComments(readMayaComponent("audit-confirmation-panel.tsx"));

    const receiptDetailsIndex = auditPanel.indexOf('data-testid="maya-audit-receipt-details"');
    const receiptTableIndex = auditPanel.indexOf("<ReceiptTable");
    const firstTableImportIndex = auditPanel.indexOf("from \"@/components/ui/table\"");

    expect({
      hasSummaryHook: auditPanel.includes('data-testid="maya-audit-summary-panel"'),
      hasReceiptDetailsHook: receiptDetailsIndex > -1,
      hasReceiptDetailsTrigger: auditPanel.includes("Audit receipt details"),
      usesDisclosurePrimitive: /\b(?:Collapsible|Accordion)\b/u.test(auditPanel),
      keepsTableImplementationAvailable: firstTableImportIndex > -1,
      keepsReceiptRowsAvailableInsideDetails: receiptTableIndex > receiptDetailsIndex,
      keepsSelectedContextSeparate: auditPanel.includes('data-testid="maya-audit-selected-action-context"')
    }).toEqual({
      hasSummaryHook: true,
      hasReceiptDetailsHook: true,
      hasReceiptDetailsTrigger: true,
      usesDisclosurePrimitive: true,
      keepsTableImplementationAvailable: true,
      keepsReceiptRowsAvailableInsideDetails: true,
      keepsSelectedContextSeparate: true
    });
  });

  it("keeps backend contract language out of the primary Maya trace and audit surfaces", () => {
    const agentTracePanel = stripComments(readMayaComponent("agent-trace-panel.tsx"));
    const auditPanel = stripComments(readMayaComponent("audit-confirmation-panel.tsx"));
    const auditPrimarySurface = auditPanel.slice(auditPanel.indexOf("<CardHeader"), auditPanel.indexOf("<Collapsible"));

    expect({
      tracePrimaryJargon: matchingLines(
        [{ path: "cockpit/components/maya/agent-trace-panel.tsx", source: agentTracePanel }],
        /\b(?:backend hooks|Static read-model evidence context|Read-model evidence context|Backend query)\b/u
      ),
      auditPrimaryJargon: [
        ...matchingLines(
          [{ path: "cockpit/components/maya/audit-confirmation-panel.tsx", source: auditPrimarySurface }],
          /\b(?:Backend-owned|Backend human|Read-model|human_decided|status ===|64-hex|auditEntryHash|valid receipt hash|Backend contract gap)\b/u
        )
      ]
    }).toEqual({
      tracePrimaryJargon: [],
      auditPrimaryJargon: []
    });
  });

  it("keeps backend gap and plumbing copy out of primary Maya surfaces", () => {
    const primarySources = [
      "maya-forensics-surface.tsx",
      "deduction-worklist-table.tsx",
      "recovery-draft-review.tsx",
      "deduction-case-workspace.tsx",
      "approval-gate-dialog.tsx",
      "evidence-dossier.tsx",
      "query-evidence-dock.tsx",
      "source-readiness-strip.tsx",
      "maya-run-kpi-strip.tsx",
      "audit-confirmation-panel.tsx"
    ].map((fileName) => ({
      path: `cockpit/components/maya/${fileName}`,
      source: taskTwoPrimarySource(fileName)
    }));
    const visiblePrimarySources = primarySources.map((file) => ({
      path: file.path,
      source: visibleTextFragments(file.source)
    }));
    const auditPanel = primaryMayaSource(readMayaComponent("audit-confirmation-panel.tsx"));
    const auditSummaryPanel = auditPanel.slice(
      auditPanel.indexOf('data-testid="maya-audit-summary-panel"'),
      auditPanel.indexOf('data-testid="maya-audit-receipt-details"')
    );
    expect({
      bannedPrimaryLines: matchingLines(
        primarySources,
        /\b(?:Contract gap|Backend contract gap|Fetched rows only|Read-model gaps|Backend gaps:|Backend gaps|Backend formatted|Backend row-switch gap|row-switched|row switching|Backend amount, read-only|Forensics read-model rows|read model rows|from the read model|backend-staged|Backend draft label|(?:Ranking|Age|Receipt) field pending|Source scoped|fetched rows)\b/u
      ),
      genericPrimaryPlumbingLines: visiblePrimaryPlumbingLines(primarySources),
      bannedPrimaryVisibleText: matchingLines(
        visiblePrimarySources,
        /\b(?:Priority\s*\(gap\)|Age\s*\(gap\)|Last updated\s*\(gap\))\b/u
      ),
      receiptUnavailableSummaryCopy: /unavailable receipt fields/u.test(auditSummaryPanel),
      draftGapRailIsDisclosure:
        /data-testid="maya-draft-rail-backend-gaps"[\s\S]{0,600}<Collapsible\b/u.test(readMayaComponent("recovery-draft-review.tsx")) &&
        readMayaComponent("recovery-draft-review.tsx").includes("Source fields pending")
    }).toEqual({
      bannedPrimaryLines: [],
      genericPrimaryPlumbingLines: [],
      bannedPrimaryVisibleText: [],
      receiptUnavailableSummaryCopy: false,
      draftGapRailIsDisclosure: true
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

  it("requires shadcn status color utilities to alias existing Recoup status tokens", () => {
    const shadcnStyles = read("cockpit/app/styles.css");

    expect(shadcnStyles).toContain("--color-success: var(--status-success-text);");
    expect(shadcnStyles).toContain("--color-success-surface: var(--status-success-bg);");
    expect(shadcnStyles).toContain("--color-success-border: var(--status-success-border);");
    expect(shadcnStyles).toContain("--color-warning: var(--status-warning-text);");
    expect(shadcnStyles).toContain("--color-danger: var(--status-danger-text);");
    expect(shadcnStyles).toContain("--color-dispute: var(--status-dispute-text);");
    expect(shadcnStyles).toContain("--color-info: var(--status-info-text);");
    expect(shadcnStyles).toContain("--color-neutral-status: var(--status-neutral-text);");
  });

  it("requires shared badge variants for semantic Maya verdict/status signals", () => {
    const badge = stripComments(read("cockpit/components/ui/badge.tsx"));

    expect({
      valid: /\bvalid\s*:/u.test(badge),
      invalid: /\binvalid\s*:/u.test(badge),
      review: /\breview\s*:/u.test(badge),
      dispute: /\bdispute\s*:/u.test(badge),
      info: /\binfo\s*:/u.test(badge),
      neutralStatus: /\bneutralStatus\s*:/u.test(badge)
    }).toEqual({
      valid: true,
      invalid: true,
      review: true,
      dispute: true,
      info: true,
      neutralStatus: true
    });
  });

  it("requires Maya verdict call sites to use the semantic verdict badge helper without dropping data-verdict", () => {
    const worklist = stripComments(readMayaComponent("deduction-worklist-table.tsx"));
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const caseWorkspace = stripComments(readMayaComponent("deduction-case-workspace.tsx"));
    const helperFileExists = readdirSync(mayaComponentRoot).includes("verdict-badge-variant.ts");
    const helperSource = helperFileExists ? read("cockpit/components/maya/verdict-badge-variant.ts") : "";

    expect({
      helperFileExists,
      helperExportsVariantMapper: helperSource.includes("verdictBadgeVariant"),
      helperUsesExactReviewStatusSet: helperSource.includes(
        'const reviewStatuses = new Set(["awaiting", "partial", "pending", "review"]);'
      ),
      helperUsesExactDisputeStatusSet: helperSource.includes('const disputeStatuses = new Set(["dispute", "recovery"]);'),
      helperUsesExactInfoStatusSet: helperSource.includes('const infoStatuses = new Set(["billing", "info"]);'),
      helperRejectsUnspecifiedAliases: !/\b(?:awaiting review|needs review|disputed)\b/u.test(helperSource),
      worklistImportsHelper: /import\s+\{\s*verdictBadgeVariant\s*\}\s+from\s+["']\.\/verdict-badge-variant(?:\.tsx?)?["']/u.test(worklist),
      worklistVerdictBadgesUseHelper:
        /\bdata-verdict=\{item\.verdict\}[\s\S]{0,220}\bvariant=\{verdictBadgeVariant\(item\.verdict\)\}/u.test(worklist),
      surfaceImportsHelper: /import\s+\{\s*verdictBadgeVariant\s*\}\s+from\s+["']\.\/verdict-badge-variant(?:\.tsx?)?["']/u.test(surface),
      casesRowsUseHelper:
        /data-testid="maya-case-row"[\s\S]{0,900}<Badge\b[^>]*\bdata-verdict=\{item\.verdict\}[^>]*\bvariant=\{verdictBadgeVariant\(item\.verdict\)\}/u.test(
          surface
        ),
      selectedCaseUsesHelper:
        /\bdata-verdict=\{visibleSelectedWorklistItem\.verdict\}[\s\S]{0,220}\bvariant=\{verdictBadgeVariant\(visibleSelectedWorklistItem\.verdict\)\}/u.test(
          surface
        ),
      caseWorkspaceImportsHelper:
        /import\s+\{\s*verdictBadgeVariant\b[\s\S]{0,80}\}\s+from\s+["']\.\/verdict-badge-variant(?:\.tsx?)?["']/u.test(caseWorkspace),
      caseHeaderPreservesDataVerdict: /\bdata-verdict=\{selectedWorklistItem\.verdict\}/u.test(caseWorkspace),
      caseHeaderUsesHelper:
        /\bdata-verdict=\{selectedWorklistItem\.verdict\}[\s\S]{0,260}\bverdictBadgeVariant\(selectedWorklistItem\.verdict\)/u.test(
          caseWorkspace
        )
    }).toEqual({
      helperFileExists: true,
      helperExportsVariantMapper: true,
      helperUsesExactReviewStatusSet: true,
      helperUsesExactDisputeStatusSet: true,
      helperUsesExactInfoStatusSet: true,
      helperRejectsUnspecifiedAliases: true,
      worklistImportsHelper: true,
      worklistVerdictBadgesUseHelper: true,
      surfaceImportsHelper: true,
      casesRowsUseHelper: true,
      selectedCaseUsesHelper: true,
      caseWorkspaceImportsHelper: true,
      caseHeaderPreservesDataVerdict: true,
      caseHeaderUsesHelper: true
    });
  });

  it("caps Task 6 primary badge density and keeps provenance behind disclosure", () => {
    const worklist = stripComments(readMayaComponent("deduction-worklist-table.tsx"));
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const caseWorkspace = stripComments(readMayaComponent("deduction-case-workspace.tsx"));
    const worklistPrimary = primaryMayaSource(worklist);
    const surfacePrimary = primaryMayaSource(surface);
    const caseHeaderStatus = caseWorkspace.slice(
      caseWorkspace.indexOf('data-testid="maya-case-detail-backend-status"'),
      caseWorkspace.indexOf('data-testid="maya-case-overview-readonly-amount"')
    );

    expect({
      worklistRowsDoNotBadgeLineIds:
        !/aria-label=\{`\$\{item\.lineId\} line IDs`\}[\s\S]{0,700}<Badge\b/u.test(worklistPrimary),
      selectedSummaryDoesNotBadgeLineIds:
        !/aria-label="Selected work item line IDs"[\s\S]{0,500}<Badge\b/u.test(surfacePrimary),
      caseHeaderDoesNotDuplicateMicroStatuses:
        !/\b(?:selectedWorklistItem\.routingLabel|selectedWorklistItem\.confidenceLabel|selected\.draft\.statusLabel)\b/u.test(
          caseHeaderStatus
        ),
      worklistSourceNotesStayBehindTooltip:
        /TooltipContent[\s\S]{0,500}\bmissingOperationalFields\.join\(", "\)/u.test(worklist),
      caseLineProvenanceStaysBehindDisclosure:
        /<SourceRecordDetails[\s\S]{0,240}\btestId="maya-case-line-source-details"[\s\S]{0,240}\btitle="Line source details"/u.test(
          caseWorkspace
        )
    }).toEqual({
      worklistRowsDoNotBadgeLineIds: true,
      selectedSummaryDoesNotBadgeLineIds: true,
      caseHeaderDoesNotDuplicateMicroStatuses: true,
      worklistSourceNotesStayBehindTooltip: true,
      caseLineProvenanceStaysBehindDisclosure: true
    });
  });

  it("requires Task 6 row selection and open-investigation affordances to be distinct", () => {
    const worklist = stripComments(readMayaComponent("deduction-worklist-table.tsx"));
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const e2e = read("tests/e2e/cockpit-premium-e2e.ts");

    expect({
      tablePropsExposeSeparateOpenIntent:
        /\bonOpenItem:\s*\(item:\s*MayaWorklistItem\)\s*=>\s*void\b/u.test(worklist) &&
        /<DeductionWorklistTable[\s\S]{0,500}\bonOpenItem=\{\(item\) => \{[\s\S]{0,120}openInvestigationForItem\(item\)/u.test(
          surface
        ),
      rowClickKeepsLocalSelectionOnly:
        /onClick=\{\(\)\s*=>\s*\{[\s\S]{0,80}\bonSelectItem\(item\);[\s\S]{0,80}\}\}/u.test(worklist),
      checkboxCopyNamesLocalFocus:
        /\baria-label=\{`\$\{item\.scenarioLabel\} local focus selection`\}/u.test(worklist),
      rowKeyboardIgnoresInteractiveDescendants:
        /isInteractiveDescendantEvent\(event\.target\)[\s\S]{0,80}\breturn\b/u.test(worklist),
      visibleRowOpenActionUsesOpenIntent:
        /data-testid="maya-row-action-open"[\s\S]{0,420}\bonOpenItem\(item\)/u.test(worklist),
      e2eKeyboardOpensRowScopedOpenAction:
        /getByTestId\("maya-row-action-open"\)[\s\S]{0,180}\bfocus\(\)[\s\S]{0,120}\bkeyboard\.press\("Enter"\)/u.test(e2e)
    }).toEqual({
      tablePropsExposeSeparateOpenIntent: true,
      rowClickKeepsLocalSelectionOnly: true,
      checkboxCopyNamesLocalFocus: true,
      rowKeyboardIgnoresInteractiveDescendants: true,
      visibleRowOpenActionUsesOpenIntent: true,
      e2eKeyboardOpensRowScopedOpenAction: true
    });
  });

  it("requires Task 6 sparse root sections and selected states to stay dense and tokenized", () => {
    const worklist = stripComments(readMayaComponent("deduction-worklist-table.tsx"));
    const surface = stripComments(readMayaComponent("maya-forensics-surface.tsx"));
    const caseWorkspace = stripComments(readMayaComponent("deduction-case-workspace.tsx"));
    const sourceReadiness = stripComments(readMayaComponent("source-readiness-strip.tsx"));

    expect({
      casesTableHasConstrainedScroll:
        /<ScrollArea\b(?=[\s\S]{0,220}\bdata-testid="maya-cases-table-scroll")(?=[\s\S]{0,220}\bh-\[min\(46rem,calc\(100vh-15rem\)\)\])[\s\S]{0,1200}<Table/u.test(
          surface
        ),
      casesSelectedSummaryIsPresent: hasJsxDataTestId(surface, "maya-cases-selected-starter"),
      evidenceRootGroupsExistingSourceReadiness: hasJsxDataTestId(surface, "maya-evidence-source-readiness-group"),
      noInventedSparseScreenFiller:
        !/\b(?:fake chart|recent activity|sparkline|trend chart|placeholder chart|decorative filler)\b/iu.test(surface),
      selectedRowsUseShadowSmToken:
        /data-\[selected=true\][^"`']*shadow-\[var\(--shadow-sm\)\]/u.test(worklist) &&
        /data-\[selected=true\][^"`']*shadow-\[var\(--shadow-sm\)\]/u.test(surface),
      selectedRowsUseLeftEdge:
        /data-\[selected=true\][^"`']*(?:border-l-\[3px\]|\[box-shadow:inset_3px_0_0)/u.test(worklist) &&
        /data-\[selected=true\][^"`']*(?:border-l-\[3px\]|\[box-shadow:inset_3px_0_0)/u.test(surface),
      casePrimaryCardsUseFlatSectionGap:
        hasJsxDataTestId(caseWorkspace, "maya-case-workspace") && /className="flex min-w-0 flex-col gap-3"/u.test(caseWorkspace),
      sourceStripKeepsSingleThinSurface:
        sourceReadiness.includes('data-testid="maya-source-readiness-strip"') &&
        sourceReadiness.includes("min-h-[58px]") &&
        !/data-testid="maya-source-readiness-strip"[\s\S]{0,600}<Card\b/u.test(sourceReadiness)
    }).toEqual({
      casesTableHasConstrainedScroll: true,
      casesSelectedSummaryIsPresent: true,
      evidenceRootGroupsExistingSourceReadiness: true,
      noInventedSparseScreenFiller: true,
      selectedRowsUseShadowSmToken: true,
      selectedRowsUseLeftEdge: true,
      casePrimaryCardsUseFlatSectionGap: true,
      sourceStripKeepsSingleThinSurface: true
    });
  });

  it("keeps Maya source readiness tiles visible on mobile while preserving the desktop single-row strip", () => {
    const sourceReadiness = stripComments(readMayaComponent("source-readiness-strip.tsx"));
    const sourceTileGridClass =
      /<div\s+className="([^"]*)"[\s\S]{0,160}\{currentConnectors\.sourceTiles\.map/u.exec(sourceReadiness)?.[1] ?? "";

    expect({
      avoidsMobileSevenColumnClamp: !/(?:^|\s)grid-cols-\[repeat\(7,minmax\(104px,1fr\)\)\](?:\s|$)/u.test(
        sourceTileGridClass
      ),
      hasMobileWrappingColumns: /\bgrid-cols-2\b/u.test(sourceTileGridClass),
      hasTabletWrappingColumns: /\bsm:grid-cols-3\b/u.test(sourceTileGridClass),
      preservesDesktopSingleRow:
        /(?:^|\s)lg:grid-cols-\[repeat\(7,minmax\(104px,1fr\)\)\](?:\s|$)/u.test(sourceTileGridClass)
    }).toEqual({
      avoidsMobileSevenColumnClamp: true,
      hasMobileWrappingColumns: true,
      hasTabletWrappingColumns: true,
      preservesDesktopSingleRow: true
    });
  });

  it("requires Task 6 KPI typography to use one stable backend value treatment", () => {
    const kpiStrip = stripComments(readMayaComponent("maya-run-kpi-strip.tsx"));

    expect({
      noDynamicKpiValueSizer: !/\bkpiValueClassName\b|\bvalue\.length\b/u.test(kpiStrip),
      valuesExposeFullBackendTextInTitle: /<CardTitle\b[\s\S]{0,260}\btitle=\{item\.value\}/u.test(kpiStrip),
      valuesUseOneTabularTruncatedSize:
        /<CardTitle\b[\s\S]{0,260}\bclassName="[^"]*\btext-2xl\b[^"]*\btabular-nums\b[^"]*\btruncate\b[^"]*"/u.test(
          kpiStrip
        ),
      noArbitraryRemBranches: !/\btext-\[\d+(?:\.\d+)?rem\]/u.test(kpiStrip),
      kpiCardsStillMapBackendRowsOnly:
        /items\.map\(\(item,\s*index\)/u.test(kpiStrip) && !/\bitems\.slice\s*\(/u.test(kpiStrip)
    }).toEqual({
      noDynamicKpiValueSizer: true,
      valuesExposeFullBackendTextInTitle: true,
      valuesUseOneTabularTruncatedSize: true,
      noArbitraryRemBranches: true,
      kpiCardsStillMapBackendRowsOnly: true
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
      sourceStripShowsBackendConnectedState:
        !/if\s*\(\s*stateLabel\s*===\s*"Connected"\s*\)\s*\{[\s\S]{0,120}return\s+"OK";/u.test(sourceStrip),
      sourceStripLabelsLegacySyntheticAsProxy:
        /if\s*\(\s*stateLabel\s*===\s*"Synthetic"\s*\)\s*\{[\s\S]{0,120}return\s+"Proxy - Supabase";/u.test(sourceStrip),
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
      sourceStripShowsBackendConnectedState: true,
      sourceStripLabelsLegacySyntheticAsProxy: true,
      traceBackendAttributesAreConditional: true,
      traceUiSummariesUseLocalAttributes: true
    });
  });

  it("requires the query dock to fail closed when backend prompt suggestions are unavailable", () => {
    const source = read("cockpit/components/maya/query-evidence-dock.tsx");

    expect(source).toMatch(/dedupePromptSuggestions\(dock\.promptSuggestions\s*\?\?\s*\[\]\)/u);
    expect(source).not.toMatch(/dock\.promptSuggestions\.map\(\(prompt\)\s*=>/u);
  });
});

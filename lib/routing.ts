/**
 * Routing evaluation engine for multi-section forms.
 *
 * Routing rules are stored in question.config.routing as a JSON object.
 * The shape depends on question type:
 *
 * Multiple Choice / Dropdown (option-based):
 *   { enabled: true, type: "OPTION_MATCH", rules: { [optionValue]: destination } }
 *   destination = "NEXT" | "SUBMIT" | sectionId
 *
 * Checkbox (set-based):
 *   { enabled: true, type: "CHECKBOX", rules: [
 *       { operator: "ANY_OF" | "ALL_OF" | "NONE_OF", options: string[], destination: string }
 *   ]}
 *
 * Short Answer / Paragraph (regex):
 *   { enabled: true, type: "REGEX", rules: [
 *       { pattern: string, flags?: string, destination: string }
 *   ]}
 *
 * Date:
 *   { enabled: true, type: "DATE", rules: [
 *       { operator: "BEFORE" | "AFTER" | "BETWEEN" | "ON", value: string, endValue?: string, destination: string }
 *   ]}
 *
 * Time:
 *   { enabled: true, type: "TIME", rules: [
 *       { operator: "BEFORE" | "AFTER" | "BETWEEN", value: string, endValue?: string, destination: string }
 *   ]}
 */

export interface OptionMatchRouting {
  enabled: boolean;
  type: "OPTION_MATCH";
  rules: Record<string, string>; // optionValue -> destination
}

export interface CheckboxRule {
  operator: "ANY_OF" | "ALL_OF" | "NONE_OF";
  options: string[];
  destination: string;
}

export interface CheckboxRouting {
  enabled: boolean;
  type: "CHECKBOX";
  rules: CheckboxRule[];
}

export interface RegexRule {
  pattern: string;
  flags?: string;
  destination: string;
}

export interface RegexRouting {
  enabled: boolean;
  type: "REGEX";
  rules: RegexRule[];
}

export interface DateRule {
  operator: "BEFORE" | "AFTER" | "BETWEEN" | "ON";
  value: string;
  endValue?: string;
  destination: string;
}

export interface DateRouting {
  enabled: boolean;
  type: "DATE";
  rules: DateRule[];
}

export interface TimeRule {
  operator: "BEFORE" | "AFTER" | "BETWEEN";
  value: string;
  endValue?: string;
  destination: string;
}

export interface TimeRouting {
  enabled: boolean;
  type: "TIME";
  rules: TimeRule[];
}

export type RoutingConfig =
  | OptionMatchRouting
  | CheckboxRouting
  | RegexRouting
  | DateRouting
  | TimeRouting;

export interface SectionRoutingConfig {
  defaultRoute?: string; // "NEXT" | "SUBMIT" | sectionId
}

/**
 * Evaluate routing rules for a single question given a respondent's answer.
 * Returns the destination string or null if no rule matched.
 */
export function evaluateQuestionRouting(
  routing: RoutingConfig | undefined | null,
  answer: string,
  questionType: string
): string | null {
  if (!routing || !routing.enabled) return null;

  switch (routing.type) {
    case "OPTION_MATCH":
      return evaluateOptionMatch(routing, answer);
    case "CHECKBOX":
      return evaluateCheckbox(routing, answer);
    case "REGEX":
      return evaluateRegex(routing, answer, questionType);
    case "DATE":
      return evaluateDate(routing, answer);
    case "TIME":
      return evaluateTime(routing, answer);
    default:
      return null;
  }
}

function evaluateOptionMatch(routing: OptionMatchRouting, answer: string): string | null {
  const trimmed = answer.trim();
  if (trimmed && routing.rules[trimmed]) {
    return routing.rules[trimmed];
  }
  // Fallback: if no exact option matched, check for "Other" routing
  if (trimmed && routing.rules["__OTHER__"]) {
    return routing.rules["__OTHER__"];
  }
  return null;
}

function evaluateCheckbox(routing: CheckboxRouting, answer: string): string | null {
  let selected: string[] = [];
  try {
    selected = answer ? JSON.parse(answer) : [];
  } catch {
    return null;
  }
  if (!Array.isArray(selected) || selected.length === 0) return null;

  for (const rule of routing.rules) {
    let match = false;
    switch (rule.operator) {
      case "ANY_OF":
        match = rule.options.some((opt) => selected.includes(opt));
        break;
      case "ALL_OF":
        match = rule.options.every((opt) => selected.includes(opt));
        break;
      case "NONE_OF":
        match = rule.options.every((opt) => !selected.includes(opt));
        break;
    }
    if (match) return rule.destination;
  }
  return null;
}

function evaluateRegex(routing: RegexRouting, answer: string, questionType: string): string | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;

  for (const rule of routing.rules) {
    try {
      let flags = rule.flags || "i";
      // Paragraph: auto-enable multiline
      if (questionType === "PARAGRAPH" && !flags.includes("m")) {
        flags += "m";
      }
      const regex = new RegExp(rule.pattern, flags);
      if (regex.test(trimmed)) {
        return rule.destination;
      }
    } catch {
      // Skip invalid patterns at runtime
      continue;
    }
  }
  return null;
}

function evaluateDate(routing: DateRouting, answer: string): string | null {
  if (!answer) return null;
  const answerDate = new Date(answer);
  if (isNaN(answerDate.getTime())) return null;

  for (const rule of routing.rules) {
    const ruleDate = new Date(rule.value);
    if (isNaN(ruleDate.getTime())) continue;

    let match = false;
    switch (rule.operator) {
      case "BEFORE":
        match = answerDate < ruleDate;
        break;
      case "AFTER":
        match = answerDate > ruleDate;
        break;
      case "ON":
        match = answerDate.toISOString().split("T")[0] === ruleDate.toISOString().split("T")[0];
        break;
      case "BETWEEN": {
        if (!rule.endValue) break;
        const endDate = new Date(rule.endValue);
        if (isNaN(endDate.getTime())) break;
        match = answerDate >= ruleDate && answerDate <= endDate;
        break;
      }
    }
    if (match) return rule.destination;
  }
  return null;
}

function evaluateTime(routing: TimeRouting, answer: string): string | null {
  if (!answer) return null;
  const answerMinutes = timeToMinutes(answer);
  if (answerMinutes === null) return null;

  for (const rule of routing.rules) {
    const ruleMinutes = timeToMinutes(rule.value);
    if (ruleMinutes === null) continue;

    let match = false;
    switch (rule.operator) {
      case "BEFORE":
        match = answerMinutes < ruleMinutes;
        break;
      case "AFTER":
        match = answerMinutes > ruleMinutes;
        break;
      case "BETWEEN": {
        if (!rule.endValue) break;
        const endMinutes = timeToMinutes(rule.endValue);
        if (endMinutes === null) break;
        match = answerMinutes >= ruleMinutes && answerMinutes <= endMinutes;
        break;
      }
    }
    if (match) return rule.destination;
  }
  return null;
}

function timeToMinutes(timeStr: string): number | null {
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Validate a regex pattern. Returns null if valid, or an error message.
 */
export function validateRegexPattern(pattern: string, flags?: string): string | null {
  try {
    new RegExp(pattern, flags || "i");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid regex";
  }
}

/**
 * Test a regex pattern against a sample input. Returns true if it matches.
 */
export function testRegexPattern(pattern: string, flags: string, input: string): boolean {
  try {
    const regex = new RegExp(pattern, flags);
    return regex.test(input);
  } catch {
    return false;
  }
}

/**
 * Given a list of sections (sorted by order), the current section index,
 * the answers for questions in the current section, and the questions,
 * determine the next section to navigate to.
 *
 * Returns: { type: "NEXT", sectionIndex: number } | { type: "SUBMIT" } | { type: "SECTION", sectionId: string }
 */
export function resolveNextSection(
  sections: Array<{ id: string; order: number; routingConfig: string | SectionRoutingConfig }>,
  currentSectionIndex: number,
  questions: Array<{ id: string; type: string; config: string | Record<string, unknown> }>,
  answers: Record<string, string>
): { type: "NEXT" | "SUBMIT" | "SECTION"; sectionId?: string; sectionIndex?: number } {
  // Check question-level routing (highest precedence)
  for (const q of questions) {
    const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
    const routing = config?.routing as RoutingConfig | undefined;
    if (!routing?.enabled) continue;

    const answer = answers[q.id] || "";
    const destination = evaluateQuestionRouting(routing, answer, q.type);
    if (destination) {
      if (destination === "NEXT") {
        const nextIdx = currentSectionIndex + 1;
        if (nextIdx >= sections.length) return { type: "SUBMIT" };
        return { type: "NEXT", sectionIndex: nextIdx };
      }
      if (destination === "SUBMIT") {
        return { type: "SUBMIT" };
      }
      // It's a sectionId
      const targetIdx = sections.findIndex((s) => s.id === destination);
      if (targetIdx >= 0) {
        return { type: "SECTION", sectionId: destination, sectionIndex: targetIdx };
      }
      // Target section not found — fall through to section default
    }
  }

  // Section-level default routing
  const currentSection = sections[currentSectionIndex];
  if (currentSection) {
    const sectionConfig: SectionRoutingConfig =
      typeof currentSection.routingConfig === "string"
        ? JSON.parse(currentSection.routingConfig || "{}")
        : currentSection.routingConfig;

    const defaultRoute = sectionConfig.defaultRoute;
    if (defaultRoute) {
      if (defaultRoute === "SUBMIT") return { type: "SUBMIT" };
      if (defaultRoute === "NEXT") {
        const nextIdx = currentSectionIndex + 1;
        if (nextIdx >= sections.length) return { type: "SUBMIT" };
        return { type: "NEXT", sectionIndex: nextIdx };
      }
      // sectionId
      const targetIdx = sections.findIndex((s) => s.id === defaultRoute);
      if (targetIdx >= 0) {
        return { type: "SECTION", sectionId: defaultRoute, sectionIndex: targetIdx };
      }
    }
  }

  // Linear fallback: next section in order
  const nextIdx = currentSectionIndex + 1;
  if (nextIdx >= sections.length) return { type: "SUBMIT" };
  return { type: "NEXT", sectionIndex: nextIdx };
}

/**
 * Validate all routing rules before publish. Returns an array of error messages.
 */
export function validateFormRouting(
  sections: Array<{ id: string; title: string; routingConfig: string | SectionRoutingConfig }>,
  questions: Array<{ id: string; label: string; type: string; config: string | Record<string, unknown> }>
): string[] {
  const errors: string[] = [];
  const sectionIds = new Set(sections.map((s) => s.id));

  function checkDestination(dest: string, context: string) {
    if (dest !== "NEXT" && dest !== "SUBMIT" && !sectionIds.has(dest)) {
      errors.push(`${context}: Routes to a non-existent section.`);
    }
  }

  // Check section-level routing
  for (const section of sections) {
    const config: SectionRoutingConfig =
      typeof section.routingConfig === "string"
        ? JSON.parse(section.routingConfig || "{}")
        : section.routingConfig;
    if (config.defaultRoute && config.defaultRoute !== "NEXT") {
      checkDestination(config.defaultRoute, `Section "${section.title}"`);
    }
  }

  // Check question-level routing
  for (const q of questions) {
    const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
    const routing = config?.routing as RoutingConfig | undefined;
    if (!routing?.enabled) continue;

    const ctx = `Question "${q.label}"`;

    if (routing.type === "OPTION_MATCH") {
      for (const [opt, dest] of Object.entries(routing.rules)) {
        checkDestination(dest, `${ctx}, option "${opt}"`);
      }
    } else if (routing.type === "CHECKBOX") {
      for (const rule of routing.rules) {
        checkDestination(rule.destination, `${ctx}, checkbox rule`);
      }
    } else if (routing.type === "REGEX") {
      for (let i = 0; i < routing.rules.length; i++) {
        const rule = routing.rules[i];
        const patternErr = validateRegexPattern(rule.pattern, rule.flags);
        if (patternErr) {
          errors.push(`${ctx}, regex rule ${i + 1}: ${patternErr}`);
        }
        checkDestination(rule.destination, `${ctx}, regex rule ${i + 1}`);
      }
    } else if (routing.type === "DATE") {
      for (let i = 0; i < routing.rules.length; i++) {
        const rule = routing.rules[i];
        checkDestination(rule.destination, `${ctx}, date rule ${i + 1}`);
        if (rule.operator === "BETWEEN" && rule.endValue) {
          if (new Date(rule.value) > new Date(rule.endValue)) {
            errors.push(`${ctx}, date rule ${i + 1}: End date is before start date.`);
          }
        }
      }
    } else if (routing.type === "TIME") {
      for (let i = 0; i < routing.rules.length; i++) {
        const rule = routing.rules[i];
        checkDestination(rule.destination, `${ctx}, time rule ${i + 1}`);
        if (rule.operator === "BETWEEN" && rule.endValue) {
          const startMin = timeToMinutes(rule.value);
          const endMin = timeToMinutes(rule.endValue);
          if (startMin !== null && endMin !== null && startMin > endMin) {
            errors.push(`${ctx}, time rule ${i + 1}: End time is before start time.`);
          }
        }
      }
    }
  }

  return errors;
}

export type LifePlanQuestion = {
  id: string;
  moduleId: string;
  moduleTitle: string;
  order: number;
  prompt: string;
  required: boolean;
  // Optional “nugget of wisdom” your agent can drop naturally after the user answers.
  wisdom?: string;
  // Optional follow-up hints if the answer is thin.
  coverageHints?: string[];
};

export const LIFEPLAN_QUESTIONS: LifePlanQuestion[] = [
  {
    id: "lp_foundation_01",
    moduleId: "foundation",
    moduleTitle: "Foundation",
    order: 1,
    required: true,
    prompt:
      "To start, what would you like this LifePlan to help you with right now? (For example: clarity, confidence, direction, relationships, career, health, etc.)",
    wisdom:
      "A helpful way to think about this: clarity often comes from naming what matters, not from forcing certainty.",
    coverageHints: ["What’s changed recently?", "What feels most urgent?", "What would ‘better’ look like?"],
  },
  {
    id: "lp_foundation_02",
    moduleId: "foundation",
    moduleTitle: "Foundation",
    order: 2,
    required: true,
    prompt:
      "If we fast-forward 6–12 months and you say “that was a really good season for me,” what would be different in your life?",
    wisdom:
      "Progress is usually easier to notice when you describe concrete differences—how your days look and how you feel in them.",
    coverageHints: ["What would you be doing more of?", "What would you stop tolerating?", "What would you feel proud of?"],
  },

  {
    id: "lp_values_01",
    moduleId: "values",
    moduleTitle: "Values & Identity",
    order: 3,
    required: true,
    prompt:
      "What are 3–5 values you want to live by (even when life gets busy), and what do those values look like in practice for you?",
    wisdom:
      "Values become real when they’re linked to behaviors—small decisions you repeat, not just ideals.",
    coverageHints: ["What do you refuse to compromise on?", "What do you admire in others?", "What do you want to be known for?"],
  },
  {
    id: "lp_values_02",
    moduleId: "values",
    moduleTitle: "Values & Identity",
    order: 4,
    required: true,
    prompt:
      "When do you feel most like yourself? Describe a few moments or environments where you feel aligned and ‘in your element.’",
    wisdom:
      "Your energy patterns are data. They often point to the conditions where you thrive.",
  },

  {
    id: "lp_emotions_01",
    moduleId: "emotions",
    moduleTitle: "Emotional Landscape",
    order: 5,
    required: true,
    prompt:
      "What situations or themes tend to hit you emotionally (stress, anxiety, shame, anger, sadness, or even excitement)? What patterns have you noticed?",
    wisdom:
      "Emotions are signals—often pointing to needs, boundaries, or values that want attention.",
    coverageHints: ["What triggers it?", "What do you tend to do next?", "What would support look like?"],
  },
  {
    id: "lp_emotions_02",
    moduleId: "emotions",
    moduleTitle: "Emotional Landscape",
    order: 6,
    required: true,
    prompt:
      "What helps you recover when you’re overwhelmed or off-track? (People, routines, places, practices, or self-talk that actually works.)",
    wisdom:
      "Recovery isn’t a luxury; it’s part of performance. Your reset habits are strategic assets.",
  },

  {
    id: "lp_people_01",
    moduleId: "people",
    moduleTitle: "People & Environment",
    order: 7,
    required: true,
    prompt:
      "Who are the key people influencing your outcomes right now? (Supportive, neutral, or draining.) What role do they play?",
    wisdom:
      "Relationships shape outcomes. It’s not about judgment—just accuracy about influence.",
    coverageHints: ["Who do you learn from?", "Who do you feel you must manage?", "Who energizes you?"],
  },
  {
    id: "lp_people_02",
    moduleId: "people",
    moduleTitle: "People & Environment",
    order: 8,
    required: true,
    prompt:
      "What environments help you do your best work or be your best self—and which environments pull you off course?",
    wisdom:
      "Environment design is one of the most underrated levers of behavior change.",
  },

  {
    id: "lp_goals_01",
    moduleId: "goals",
    moduleTitle: "Goals & Objectives",
    order: 9,
    required: true,
    prompt:
      "Name 1–3 goals you want to achieve in the next 6–12 months. For each, what does ‘done’ look like?",
    wisdom:
      "Goals get easier when ‘done’ is observable—something you can point to, measure, or clearly describe.",
    coverageHints: ["Which goal matters most and why?", "What would success look like in detail?"],
  },
  {
    id: "lp_goals_02",
    moduleId: "goals",
    moduleTitle: "Goals & Objectives",
    order: 10,
    required: true,
    prompt:
      "What are the biggest obstacles or risks that could derail those goals—and what’s your plan to handle them?",
    wisdom:
      "A good plan isn’t optimistic—it’s resilient. It anticipates friction and prepares for it.",
  },

  {
    id: "lp_systems_01",
    moduleId: "systems",
    moduleTitle: "Habits & Systems",
    order: 11,
    required: true,
    prompt:
      "What 2–3 habits or systems would make the biggest difference for you if you were consistent for 30–60 days?",
    wisdom:
      "Consistency usually comes from lowering the ‘activation energy’—making the first step extremely easy.",
    coverageHints: ["What would you do daily vs weekly?", "What would be the smallest version of the habit?"],
  },
  {
    id: "lp_systems_02",
    moduleId: "systems",
    moduleTitle: "Habits & Systems",
    order: 12,
    required: true,
    prompt:
      "How do you want to track your progress (in a way you’ll actually use)? What signals would tell you you’re drifting?",
    wisdom:
      "Tracking works best when it’s lightweight and tied to identity: ‘this is who I’m becoming.’",
  },

  {
    id: "lp_close_01",
    moduleId: "closing",
    moduleTitle: "Closing",
    order: 13,
    required: true,
    prompt:
      "What’s one commitment you’re willing to make for the next 7 days that supports this LifePlan?",
    wisdom:
      "Small commitments reduce overwhelm and create momentum—momentum changes self-trust.",
  },
  {
    id: "lp_close_02",
    moduleId: "closing",
    moduleTitle: "Closing",
    order: 14,
    required: false,
    prompt:
      "Is there anything important we missed that you want reflected in your LifePlan?",
  },
];

export const LIFEPLAN_MODULES = Array.from(
  new Map(LIFEPLAN_QUESTIONS.map((q) => [q.moduleId, q.moduleTitle])).entries()
).map(([moduleId, moduleTitle]) => ({ moduleId, moduleTitle }));

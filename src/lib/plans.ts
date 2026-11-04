import type { Tier } from "./types";

export interface TierInfo {
  label: string;
  tagline: string;
  price: string;
  activeExams: number;
  studentsPerExam: number;
  ocr: string;
  features: string[];
}

export const TIER_LIMITS: Record<Tier, TierInfo> = {
  free: {
    label: "Free",
    tagline: "For trying real exams",
    price: "$0",
    activeExams: 3,
    studentsPerExam: 30,
    ocr: "Manual + document parser",
    features: [
      "3 active exams",
      "30 students per exam",
      "Manual questions + document parser",
      "Waiting room, PIN access, autosave",
    ],
  },
  plus: {
    label: "Plus",
    tagline: "For a busy department",
    price: "$12/mo",
    activeExams: 10,
    studentsPerExam: 100,
    ocr: "Manual + document parser",
    features: [
      "10 active exams",
      "100 students per exam",
      "Everything in Free",
      "Encrypted channels for staff & students",
    ],
  },
  pro: {
    label: "Pro",
    tagline: "For whole schools",
    price: "$39/mo",
    activeExams: 50,
    studentsPerExam: 500,
    ocr: "OCR with priority queue",
    features: [
      "50 active exams",
      "500 students per exam",
      "Photo & webcam OCR ingestion",
      "Full grading + analytics views",
    ],
  },
  enterprise: {
    label: "Enterprise",
    tagline: "For exam bodies & groups",
    price: "Talk to us",
    activeExams: 100_000,
    studentsPerExam: 100_000,
    ocr: "OCR with priority queue",
    features: [
      "Unlimited exams & cohorts",
      "Custom branding",
      "Custom domain",
      "Priority support",
    ],
  },
};

export function tierOf(t: string | null | undefined): Tier {
  if (t === "plus" || t === "pro" || t === "enterprise") return t;
  return "free";
}

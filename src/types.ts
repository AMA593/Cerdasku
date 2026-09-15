export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
}

export interface Submission {
  id?: string;
  studentName: string;
  subject: string;
  score: number;
  totalQuestions: number;
  answers: Record<string, string>;
  createdAt: number;
}

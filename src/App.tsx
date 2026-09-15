import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, setDoc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { questionBank } from './data/questions';
import { shuffleArray } from './utils/shuffle';
import { Question, Submission } from './types';
import { BookOpen, LogOut, CheckCircle2, ChevronLeft, ChevronRight, Lock, Plus, Trash2, Edit2, Loader2, Save, X } from 'lucide-react';

type AppView = 'student_setup' | 'student_quiz' | 'student_done' | 'teacher_dashboard';

const ALLOWED_TEACHER_EMAILS = ['ahmadmaiyah35@gmail.com'];

export default function App() {
  const [view, setView] = useState<AppView>('student_setup');
  const [isLoading, setIsLoading] = useState(false);
  
  // Student State
  const [studentName, setStudentName] = useState('');
  const [subject, setSubject] = useState('Dasar-Dasar TJKT');
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState(0);

  // Teacher State
  const [isTeacher, setIsTeacher] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [teacherTab, setTeacherTab] = useState<'submissions' | 'questions'>('submissions');
  const [dbQuestions, setDbQuestions] = useState<Question[]>([]);
  
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editQuestionForm, setEditQuestionForm] = useState<Question>({
    id: '', text: '', options: ['', '', '', ''], correctAnswer: ''
  });

  // Auth listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && user.email && ALLOWED_TEACHER_EMAILS.includes(user.email)) {
        setIsTeacher(true);
      } else {
        setIsTeacher(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleStartQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !subject.trim()) return;

    setIsLoading(true);
    try {
      const q = query(collection(db, 'questions'));
      const snap = await getDocs(q);
      let allQuestions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));

      if (allQuestions.length === 0) {
        // Fallback to local questions if db is empty
        allQuestions = questionBank;
      }

      // Pick up to 25 random questions and shuffle options
      const selected = shuffleArray(allQuestions).slice(0, 25).map(q => ({
        ...q,
        options: shuffleArray(q.options)
      }));
      
      setQuizQuestions(selected);
      setCurrentIndex(0);
      setAnswers({});
      setView('student_quiz');
    } catch(err) {
      console.error(err);
      alert("Gagal memuat soal, silakan periksa koneksi internet.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOption = (option: string) => {
    setAnswers(prev => ({
      ...prev,
      [quizQuestions[currentIndex].id]: option
    }));
  };

  const handleForceExit = () => {
    setStudentName('');
    setAnswers({});
    setCurrentIndex(0);
    setScore(0);
    setView('student_setup');
  };

  const handleSubmitQuiz = async () => {
    let calculatedScore = 0;
    quizQuestions.forEach(q => {
      if (answers[q.id] === q.correctAnswer) {
        calculatedScore++;
      }
    });

    setScore(calculatedScore);

    const submissionData: Submission = {
      studentName: studentName.trim(),
      subject: subject.trim(),
      score: calculatedScore,
      totalQuestions: quizQuestions.length,
      answers,
      createdAt: Date.now()
    };

    try {
      await addDoc(collection(db, 'submissions'), submissionData);
      setView('student_done');
    } catch (error) {
      console.error(error);
      alert("Gagal mengirim data ujian. Silakan coba lagi.");
    }
  };

  // --- Teacher Functions ---
  const handleTeacherLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      if (result.user.email && !ALLOWED_TEACHER_EMAILS.includes(result.user.email)) {
        await signOut(auth);
        alert("Maaf, email Anda tidak memiliki akses sebagai guru.");
        return;
      }

      loadSubmissions();
      loadQuestions();
      setView('teacher_dashboard');
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log("Login dibatalkan oleh pengguna.");
      } else {
        console.error("Login Guru gagal", error);
        alert("Gagal masuk sebagai guru: " + error.message);
      }
    }
  };

  const handleTeacherLogout = async () => {
    await signOut(auth);
    setView('student_setup');
  };

  const loadSubmissions = async () => {
    try {
      const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
      setSubmissions(data);
    } catch (error) {
      console.error("Gagal memuat data", error);
    }
  };

  const loadQuestions = async () => {
    try {
      const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      setDbQuestions(data);
    } catch (error) {
      console.error("Gagal memuat bank soal", error);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    await deleteDoc(doc(db, 'submissions', id));
    loadSubmissions();
  };

  const viewTeacherDashboard = () => {
    if (isTeacher) {
      loadSubmissions();
      loadQuestions();
      setView('teacher_dashboard');
    } else {
      handleTeacherLogin();
    }
  };

  const handleSeedQuestions = async () => {
    setIsLoading(true);
    try {
      const promises = questionBank.map(q => {
        const ref = doc(collection(db, 'questions'));
        return setDoc(ref, {
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
          createdAt: Date.now()
        });
      });
      await Promise.all(promises);
      loadQuestions();
    } catch (err) {
      console.error(err);
      alert("Gagal memasukkan soal");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editQuestionForm.text || editQuestionForm.options.some(o => !o) || !editQuestionForm.correctAnswer) {
      alert("Mohon lengkapi semua bidang soal dan pastikan opsi jawaban tidak kosong.");
      return;
    }
    
    if (!editQuestionForm.options.includes(editQuestionForm.correctAnswer)) {
      alert("Jawaban benar harus sama persis dengan salah satu opsi.");
      return;
    }

    setIsLoading(true);
    try {
      const qData = {
        text: editQuestionForm.text,
        options: editQuestionForm.options,
        correctAnswer: editQuestionForm.correctAnswer,
        createdAt: editQuestionForm.id ? undefined : Date.now()
      };

      if (editQuestionForm.id) {
        // Remove undefined fields
        const updateData = { text: qData.text, options: qData.options, correctAnswer: qData.correctAnswer };
        await setDoc(doc(db, 'questions', editQuestionForm.id), updateData, { merge: true });
      } else {
        await addDoc(collection(db, 'questions'), qData);
      }
      setIsEditingQuestion(false);
      loadQuestions();
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan soal");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    await deleteDoc(doc(db, 'questions', id));
    loadQuestions();
  };

  const handleDeleteAllQuestions = async () => {
    setIsLoading(true);
    try {
      const qSnapshot = await getDocs(collection(db, 'questions'));
      const deletePromises = qSnapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      loadQuestions();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditOptionChange = (index: number, val: string) => {
    const newOptions = [...editQuestionForm.options];
    newOptions[index] = val;
    setEditQuestionForm(prev => ({ ...prev, options: newOptions }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      
      {/* 1. SETUP PAGE */}
      {view === 'student_setup' && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-md text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BookOpen size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Ujian Daring</h1>
            <p className="text-slate-500 mb-8">Silakan isi identitas Anda untuk memulai ujian.</p>
            
            <form onSubmit={handleStartQuiz} className="space-y-4">
              <div className="text-left">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Masukkan nama Anda..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  required
                />
              </div>
              <div className="text-left">
                <label className="block text-sm font-medium text-slate-700 mb-1">Mata Pelajaran</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                  required
                >
                  <option value="Dasar-Dasar TJKT">Dasar-Dasar TJKT</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors mt-4 disabled:opacity-70"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Mulai Ujian'}
              </button>
            </form>

            <button 
              onClick={viewTeacherDashboard}
              className="mt-8 text-xs text-slate-400 flex items-center gap-1 mx-auto hover:text-slate-600 transition-colors"
            >
              <Lock size={12} /> Akses Guru
            </button>
          </div>
        </div>
      )}

      {/* 2. QUIZ PAGE */}
      {view === 'student_quiz' && quizQuestions.length > 0 && (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col">
          <header className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Ujian: {subject}</h2>
              <p className="text-sm text-slate-500">Peserta: {studentName}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-4 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                Soal {currentIndex + 1} / {quizQuestions.length}
              </div>
              <button
                onClick={handleForceExit}
                className="px-4 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-full text-sm font-medium transition-colors"
              >
                Keluar
              </button>
            </div>
          </header>

          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex-1 mb-8">
            <h3 className="text-xl font-medium text-slate-900 mb-8 leading-relaxed">
              {quizQuestions[currentIndex].text}
            </h3>

            <div className="space-y-3">
              {quizQuestions[currentIndex].options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(option)}
                  className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all flex items-center justify-between
                    ${answers[quizQuestions[currentIndex].id] === option 
                      ? 'border-blue-600 bg-blue-50 text-blue-900' 
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-700'
                    }`}
                >
                  <span className="text-base">{option}</span>
                  {answers[quizQuestions[currentIndex].id] === option && (
                    <CheckCircle2 className="text-blue-600 shrink-0" size={20} />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentIndex(prev => prev - 1)}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
              <span className="hidden sm:inline">Sebelumnya</span>
            </button>

            {currentIndex < quizQuestions.length - 1 ? (
              <button
                onClick={() => setCurrentIndex(prev => prev + 1)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <span className="hidden sm:inline">Selanjutnya</span>
                <ChevronRight size={20} />
              </button>
            ) : (
              <button
                onClick={handleSubmitQuiz}
                disabled={Object.keys(answers).length < quizQuestions.length}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Selesai & Kirim
              </button>
            )}
          </div>
          
          {currentIndex === quizQuestions.length - 1 && Object.keys(answers).length < quizQuestions.length && (
            <p className="text-center text-sm text-red-500 mt-4">
              Harap jawab semua soal sebelum mengumpulkan. ({Object.keys(answers).length} terjawab)
            </p>
          )}
        </div>
      )}

      {/* 3. DONE PAGE */}
      {view === 'student_done' && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-md text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Ujian Selesai!</h1>
            <p className="text-slate-600 mb-6">Terima kasih <strong>{studentName}</strong>, data ujian Anda untuk mata pelajaran <strong>{subject}</strong> telah berhasil dikirim kepada guru.</p>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 inline-block mx-auto text-left">
              <p className="text-sm text-slate-500 mb-1">Skor Anda:</p>
              <p className="text-3xl font-bold text-slate-900">{Math.round((score / quizQuestions.length) * 100)}</p>
            </div>

            <button
              onClick={() => {
                setStudentName('');
                setSubject('');
                setView('student_setup');
              }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-4 rounded-xl transition-colors"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      )}

      {/* 4. TEACHER DASHBOARD */}
      {view === 'teacher_dashboard' && (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
          <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard Guru</h1>
              <div className="flex gap-4 mt-3">
                <button 
                  onClick={() => setTeacherTab('submissions')}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${teacherTab === 'submissions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Hasil Ujian
                </button>
                <button 
                  onClick={() => setTeacherTab('questions')}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${teacherTab === 'questions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Bank Soal
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  if (teacherTab === 'submissions') loadSubmissions();
                  else loadQuestions();
                }}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
              >
                Segarkan Data
              </button>
              <button 
                onClick={handleTeacherLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <LogOut size={16} />
                Keluar
              </button>
            </div>
          </header>

          {teacherTab === 'submissions' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Nama Siswa</th>
                      <th className="px-6 py-4">Mata Pelajaran</th>
                      <th className="px-6 py-4">Waktu Pengerjaan</th>
                      <th className="px-6 py-4">Skor Akhir</th>
                      <th className="px-6 py-4">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {submissions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Belum ada data ujian yang masuk.</td>
                      </tr>
                    ) : (
                      submissions.map(sub => {
                        const finalScore = Math.round((sub.score / sub.totalQuestions) * 100);
                        return (
                          <tr key={sub.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-900">{sub.studentName}</td>
                            <td className="px-6 py-4 text-slate-600">{sub.subject}</td>
                            <td className="px-6 py-4 text-slate-500">
                              {new Date(sub.createdAt).toLocaleString('id-ID')}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-medium text-xs
                                ${finalScore >= 80 ? 'bg-emerald-100 text-emerald-700' : 
                                  finalScore >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}
                              >
                                {finalScore} ({sub.score}/{sub.totalQuestions})
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => handleDeleteSubmission(sub.id!)}
                                className="text-red-500 hover:text-red-700 font-medium text-xs"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {teacherTab === 'questions' && (
            <div className="space-y-6">
              {isEditingQuestion ? (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-900">{editQuestionForm.id ? 'Ubah Soal' : 'Tambah Soal Baru'}</h2>
                    <button onClick={() => setIsEditingQuestion(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  <form onSubmit={handleSaveQuestion} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Pertanyaan</label>
                      <textarea
                        value={editQuestionForm.text}
                        onChange={(e) => setEditQuestionForm(prev => ({ ...prev, text: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        rows={3}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {editQuestionForm.options.map((opt, idx) => (
                        <div key={idx}>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Opsi {idx + 1}</label>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleEditOptionChange(idx, e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                            required
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Jawaban Benar (Pilih salah satu dari opsi)</label>
                      <select
                        value={editQuestionForm.correctAnswer}
                        onChange={(e) => setEditQuestionForm(prev => ({ ...prev, correctAnswer: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        required
                      >
                        <option value="" disabled>-- Pilih Jawaban Benar --</option>
                        {editQuestionForm.options.filter(o => o).map((opt, idx) => (
                          <option key={idx} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIsEditingQuestion(false)}
                        className="px-6 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-70"
                      >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Simpan Soal
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Daftar Soal Pilihan Ganda</h2>
                      <p className="text-sm text-slate-500">Total: {dbQuestions.length} soal (Sistem akan mengacak dan mengambil 25 soal untuk siswa)</p>
                    </div>
                    <div className="flex gap-2">
                      {dbQuestions.length === 0 && (
                        <button
                          onClick={handleSeedQuestions}
                          disabled={isLoading}
                          className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl"
                        >
                          Isi 25 Soal TJKT
                        </button>
                      )}
                      {dbQuestions.length > 0 && (
                        <button
                          onClick={handleDeleteAllQuestions}
                          disabled={isLoading}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} /> Hapus Semua
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditQuestionForm({ id: '', text: '', options: ['', '', '', ''], correctAnswer: '' });
                          setIsEditingQuestion(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
                      >
                        <Plus size={16} /> Tambah Soal
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {dbQuestions.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-slate-500">Bank soal masih kosong.</p>
                      </div>
                    ) : (
                      dbQuestions.map((q, index) => (
                        <div key={q.id} className="p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="font-medium text-slate-900 mb-2">{index + 1}. {q.text}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                {q.options.map((opt, idx) => (
                                  <div key={idx} className={`text-sm px-3 py-1.5 rounded-lg border ${opt === q.correctAnswer ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                                    {String.fromCharCode(65 + idx)}. {opt}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button 
                                onClick={() => {
                                  setEditQuestionForm(q);
                                  setIsEditingQuestion(true);
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
    </div>
  );
}

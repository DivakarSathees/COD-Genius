import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MonacoEditorModule } from '@materia-ui/ngx-monaco-editor';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { CodServiceService } from '../../services/cod-service.service';
import { AuthService } from '../../services/auth.service';
import { QuillEditorComponent } from 'ngx-quill';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-cod-generator',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MonacoEditorModule, NgSelectModule, QuillEditorComponent, MatTooltipModule],
  templateUrl: './cod-generator.component.html',
  styleUrl: './cod-generator.component.css'
})
export class CodGeneratorComponent implements OnInit {

  sessions: any[] = [];
  selectedSessionId = '';
  newSession = true;
  uniqueTopics: string[] = [];

  questionBanks: any[] = [];
  filteredQuestionBanks: any[] = [];
  selectedCreator = '';
  uniqueCreators: string[] = [];
  selectedQbId: string | null = null;

  subtopics: any[] = [];
  cods: any[] = [];

  promptForm: FormGroup;

  loading = false;
  batchLoading = false;
  useGuidelines = false;
  guidelinesText = '';
  guidelinesEditorOpen = false;
  guidelinesLoading = false;

  tokenUsage: Record<string, { date: string; provider: string; model: string; promptTokens: number; completionTokens: number; totalTokens: number; calls: number }> = {};
  tokenModalOpen = false;
  tokenUsageLoading = false;

  private get _allRows() { return Object.values(this.tokenUsage); }

  get totalTokensUsed(): number { return this._allRows.reduce((s, v) => s + v.totalTokens, 0); }
  get totalPromptTokens(): number { return this._allRows.reduce((s, v) => s + v.promptTokens, 0); }
  get totalCompletionTokens(): number { return this._allRows.reduce((s, v) => s + v.completionTokens, 0); }
  get totalCalls(): number { return this._allRows.reduce((s, v) => s + v.calls, 0); }

  get tokenUsageByDate(): { date: string; rows: any[]; calls: number; promptTokens: number; completionTokens: number; totalTokens: number }[] {
    const byDate: Record<string, any[]> = {};
    for (const row of this._allRows) {
      const d = row.date || 'Unknown';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(row);
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, rows]) => ({
        date,
        rows: rows.sort((a: any, b: any) => b.totalTokens - a.totalTokens),
        calls:            rows.reduce((s: number, r: any) => s + r.calls, 0),
        promptTokens:     rows.reduce((s: number, r: any) => s + r.promptTokens, 0),
        completionTokens: rows.reduce((s: number, r: any) => s + r.completionTokens, 0),
        totalTokens:      rows.reduce((s: number, r: any) => s + r.totalTokens, 0),
      }));
  }

  availableModels: { groq: any[]; azure: any[]; puter: any[]; gemini: any[]; github: any[] } = { groq: [], azure: [], puter: [], gemini: [], github: [] };
  providerModels: any[] = [];

  // ── Puter.js browser SDK state ─────────────────────────────────────────────
  puterSignedIn = false;
  puterUsername = '';
  puterChecking = false;

  get isPuterProvider(): boolean { return this.promptForm?.value?.provider === 'puter'; }

  toolbarOptions = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['code-block'],
      [{ header: [1, 2, 3, false] }]
    ]
  };

  get currentUser() { return this.authService.getCurrentUser(); }
  logout() { this.authService.logout(); }

  // ── Generated Questions History ────────────────────────────────────────────
  historyOpen = false;
  historyQuestions: any[] = [];
  historyLoading = false;
  historyPage = 1;
  historyTotal = 0;
  historyLimit = 15;
  historySearch = '';
  historyLangFilter = '';
  historyUploadFilter = 'all';
  historyExpandedIdx: number | null = null;
  historyExpandedTc = new Set<number>();

  get historyPageCount(): number { return Math.ceil(this.historyTotal / this.historyLimit); }

  openHistory() {
    this.historyOpen = true;
    this.historyPage = 1;
    this.historySearch = '';
    this.historyLangFilter = '';
    this.historyUploadFilter = 'all';
    this.historyExpandedIdx = null;
    this.historyExpandedTc.clear();
    this.loadHistory();
  }

  loadHistory() {
    this.historyLoading = true;
    this.historyExpandedIdx = null;
    this.historyExpandedTc.clear();
    const params: any = { page: this.historyPage, limit: this.historyLimit };
    if (this.historySearch.trim()) params.search = this.historySearch.trim();
    if (this.historyLangFilter) params.language = this.historyLangFilter;
    if (this.historyUploadFilter !== 'all') params.uploaded = this.historyUploadFilter;
    this.codService.getGeneratedQuestions(params).subscribe({
      next: (res: any) => {
        this.historyQuestions = res.questions || [];
        this.historyTotal = res.total || 0;
        this.historyLoading = false;
      },
      error: () => {
        this.historyLoading = false;
        this.toastr.error('Failed to load history.', 'Error');
      }
    });
  }

  historyGoPage(p: number) {
    if (p < 1 || p > this.historyPageCount) return;
    this.historyPage = p;
    this.loadHistory();
  }

  historyToggleExpand(idx: number) {
    this.historyExpandedIdx = this.historyExpandedIdx === idx ? null : idx;
    if (this.historyExpandedIdx !== idx) this.historyExpandedTc.delete(idx);
  }

  historyToggleTc(idx: number) {
    if (this.historyExpandedTc.has(idx)) this.historyExpandedTc.delete(idx);
    else this.historyExpandedTc.add(idx);
  }

  safeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  langClass(lang: string): string {
    const map: Record<string, string> = {
      'java': 'java', 'python': 'python',
      'c#': 'csharp', 'csharp': 'csharp',
      'c': 'c', 'c++': 'cpp', 'cpp': 'cpp',
      'javascript': 'javascript', 'typescript': 'typescript', 'go': 'go',
    };
    return map[(lang || '').toLowerCase()] || 'other';
  }

  constructor(private fb: FormBuilder, private codService: CodServiceService, private authService: AuthService, private toastr: ToastrService, private sanitizer: DomSanitizer) {
    this.promptForm = this.fb.group({
      prompt: ['', Validators.required],
      token: ['', Validators.required],
      searchText: ['', Validators.required],
      language: ['Java', Validators.required],
      difficulty_level: ['Easy', Validators.required],
      topic: ['', Validators.required],
      format: ['detailed', Validators.required],
      count: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
      provider: ['gemini', Validators.required],
      model: [''],
      qb_id: [''],
      sub_topic_id: [''],
      topic_id: [''],
      subject_id: [''],
      topic_name: [''],
      subject_name: [''],
    });
  }

  ngOnInit(): void {
    this.getAllSessions();
    this.loadModels();
    this.loadTokenUsage();
    this.promptForm.get('provider')!.valueChanges.subscribe(p => {
      this.providerModels = (this.availableModels as any)[p] || [];
      this.promptForm.patchValue({ model: this.providerModels[0]?.id || '' });
      if (p === 'puter') this.checkPuterAuth();
    });
  }

  loadModels() {
    this.codService.getModels().subscribe({
      next: (res: any) => {
        this.availableModels = res;
        const currentProvider = this.promptForm.value.provider;
        this.providerModels = res[currentProvider] || [];
        this.promptForm.patchValue({ model: this.providerModels[0]?.id || '' });
      }
    });
  }

  loadTokenUsage() {
    this.tokenUsageLoading = true;
    this.codService.getTokenUsage().subscribe({
      next: (res: any) => {
        (res.usage || []).forEach((doc: any) => {
          const key = `${doc.date}/${doc.provider}/${doc.model}`;
          this.tokenUsage[key] = {
            date:             doc.date             || 'Unknown',
            provider:         doc.provider,
            model:            doc.model,
            promptTokens:     doc.prompt_tokens     || 0,
            completionTokens: doc.completion_tokens || 0,
            totalTokens:      doc.total_tokens      || 0,
            calls:            doc.calls             || 0,
          };
        });
        this.tokenUsageLoading = false;
      },
      error: () => { this.tokenUsageLoading = false; }
    });
  }

  toggleGuidelines() {
    this.useGuidelines = !this.useGuidelines;
    if (this.useGuidelines && !this.guidelinesText) {
      this.guidelinesLoading = true;
      this.codService.getGuidelines().subscribe({
        next: (res: any) => { this.guidelinesText = res.content || ''; this.guidelinesLoading = false; },
        error: () => { this.guidelinesLoading = false; this.toastr.error('Failed to load guidelines.', 'Error'); }
      });
    }
  }

  accumulateUsage(usage: any) {
    if (!usage?.model) return;
    const date = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const key = `${date}/${usage.provider}/${usage.model}`;
    const existing = this.tokenUsage[key];
    if (existing) {
      existing.promptTokens     += usage.prompt_tokens     || 0;
      existing.completionTokens += usage.completion_tokens || 0;
      existing.totalTokens      += usage.total_tokens      || 0;
      existing.calls++;
    } else {
      this.tokenUsage[key] = {
        date,
        provider:         usage.provider,
        model:            usage.model,
        promptTokens:     usage.prompt_tokens     || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens:      usage.total_tokens      || 0,
        calls: 1,
      };
    }
  }

  accumulateUsageLog(usageLog: any[]) {
    if (!Array.isArray(usageLog)) return;
    usageLog.forEach(u => this.accumulateUsage(u));
  }

  // ── Puter.js browser SDK helpers ────────────────────────────────────────────
  async checkPuterAuth() {
    const puter = (window as any).puter;
    if (!puter?.auth) return;
    this.puterChecking = true;
    try {
      const user = await puter.auth.getUser();
      this.puterSignedIn = !!user;
      this.puterUsername = user?.username || '';
    } catch {
      this.puterSignedIn = false;
      this.puterUsername = '';
    }
    this.puterChecking = false;
  }

  async loginToPuter() {
    const puter = (window as any).puter;
    if (!puter?.auth) { window.open('https://puter.com', '_blank'); return; }
    try {
      await puter.auth.signIn();
      await this.checkPuterAuth();
    } catch {
      window.open('https://puter.com', '_blank');
    }
  }

  private async callPuterAI(messages: { role: string; content: string }[], model: string): Promise<string> {
    const puter = (window as any).puter;
    if (!puter?.ai?.chat) throw new Error('Puter.js not loaded. Ensure puter.js CDN script is present.');
    const res = await puter.ai.chat(messages, { model: model || 'anthropic/claude-haiku-4.5' });
    if (!res) throw new Error('Empty response from Puter AI');
    if (typeof res === 'string') return res;
    if (res.choices?.[0]?.message?.content) return res.choices[0].message.content;
    if (typeof res.content === 'string') return res.content;
    if (Array.isArray(res.content)) return res.content[0]?.text || '';
    if (res.message?.content) {
      const c = res.message.content;
      return typeof c === 'string' ? c : (Array.isArray(c) ? c[0]?.text || '' : JSON.stringify(c));
    }
    return JSON.stringify(res);
  }

  private parsePuterJSON(text: string): any {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try { return JSON.parse(text); } catch (_) {}
    const arrIdx = text.indexOf('[');
    const objIdx = text.indexOf('{');
    const start = arrIdx !== -1 && (objIdx === -1 || arrIdx < objIdx) ? arrIdx : objIdx;
    if (start === -1) throw new Error('No JSON found in Puter AI response');
    const open = text[start], close = open === '[' ? ']' : '}';
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === open) depth++;
      else if (text[i] === close) depth--;
      if (depth === 0) { end = i; break; }
    }
    if (end === -1) throw new Error('JSON not properly closed in Puter AI response');
    return JSON.parse(text.slice(start, end + 1));
  }

  get activeGuidelinesContent(): string | null {
    return this.useGuidelines ? this.guidelinesText : null;
  }

  getAllSessions() {
    this.codService.getAllSessions().subscribe({
      next: (res: any) => { this.sessions = res.sessions || []; }
    });
  }

  selectSession(session: any) {
    this.newSession = false;
    if (this.selectedSessionId === session._id) {
      this.selectedSessionId = '';
      sessionStorage.removeItem('codSessionId');
      this.promptForm.get('language')?.enable();
      this.promptForm.get('topic')?.enable();
    } else {
      this.selectedSessionId = session._id;
      sessionStorage.setItem('codSessionId', session._id);
      const parts = session.name.split(' - ');
      const lang = parts[0];
      const topic = parts.slice(1).join(' - ');
      if (topic && !this.uniqueTopics.includes(topic)) this.uniqueTopics.push(topic);
      this.promptForm.patchValue({ language: lang, topic });
      this.promptForm.get('language')?.disable();
      this.promptForm.get('topic')?.disable();
    }
  }

  createNewSession() {
    this.newSession = true;
    this.selectedSessionId = '';
    sessionStorage.removeItem('codSessionId');
    this.promptForm.get('language')?.enable();
    this.promptForm.get('topic')?.enable();
  }

  onSubtopicChangeById(sub_topic_id: any) {
    const selected = this.subtopics.find(s => s.sub_topic_id === sub_topic_id);
    if (selected) {
      this.promptForm.patchValue({
        sub_topic_id: selected.sub_topic_id,
        topic_id: selected.topic.topic_id,
        subject_id: selected.topic.subject.subject_id,
        topic_name: selected.topic.name,
        subject_name: selected.topic.subject.name,
      });
    }
  }

  customSearchFn = (term: string, item: any) => {
    const t = term.toLowerCase();
    return item.name.toLowerCase().includes(t) ||
           item.topic?.name?.toLowerCase().includes(t) ||
           item.topic?.subject?.name?.toLowerCase().includes(t);
  };

  filterByCreator() {
    this.filteredQuestionBanks = this.selectedCreator
      ? this.questionBanks.filter(qb => qb.createdBy === this.selectedCreator)
      : [...this.questionBanks];
  }

  selectQB(qb: any) { this.selectedQbId = qb.qb_id; }

  extractUniqueCreators() {
    this.uniqueCreators = Array.from(new Set(this.questionBanks.map(qb => qb.createdBy).filter(Boolean)));
  }

  private makeCod(raw: any): any {
    const langKey = (raw.language || 'java').toLowerCase();
    const langMap: Record<string, string> = {
      java: 'java', python: 'python', 'c#': 'csharp', csharp: 'csharp',
      c: 'c', 'c++': 'cpp', javascript: 'javascript', typescript: 'typescript', go: 'go'
    };
    return {
      ...raw,
      solution: '',
      samples: [],
      validation: null,
      solutionGenerated: false,
      solutionVisible: false,
      solutionGenerating: false,
      solutionError: '',
      collapsed: false,
      input: '',
      codeOutput: '',
      outputerror: '',
      runcode: false,
      runningAll: false,
      tcRegenerating: false,
      tcCount: 15,
      refinePrompt: '',
      refining: false,
      upload: false,
      batchStatus: null,
      debuggingMode: false,
      debugPrompt: '',
      debugBugCount: 3,
      debugSolution: '',
      debugGenerating: false,
      debugRunningAll: false,
      editorOptions: { theme: 'vs-dark', language: langMap[langKey] || 'java' },
    };
  }

  qbSearching = false;

  searchQB() {
    const { token, searchText } = this.promptForm.value;
    if (!token?.trim()) {
      this.toastr.warning('Auth Token is required to search question banks.', 'Validation Failed'); return;
    }
    if (!searchText?.trim()) {
      this.toastr.warning('Enter a QB Search text first.', 'Validation Failed'); return;
    }
    this.qbSearching = true;
    this.codService.getQuestionBanks({ search: searchText, authToken: token }).subscribe({
      next: (res: any) => {
        this.questionBanks = res.results?.questionbanks || [];
        this.filteredQuestionBanks = [...this.questionBanks];
        this.extractUniqueCreators();
        this.qbSearching = false;
        this.toastr.success(`${this.questionBanks.length} question bank(s) found.`, 'QB Search');
      },
      error: () => {
        this.toastr.error('Failed to fetch question banks.', 'QB Search');
        this.qbSearching = false;
      }
    });
  }

  private fetchSideData() {
    const token = this.promptForm.value.token;
    this.codService.getQuestionBanks({ search: this.promptForm.value.searchText, authToken: token }).subscribe({
      next: (res: any) => {
        this.questionBanks = res.results?.questionbanks || [];
        this.filteredQuestionBanks = [...this.questionBanks];
        this.extractUniqueCreators();
      }
    });
    this.codService.getTopics(token).subscribe({
      next: (res: any) => {
        this.subtopics = res.data || [];
        if (this.subtopics.length > 0) {
          const first = this.subtopics[0];
          this.promptForm.patchValue({
            sub_topic_id: first.sub_topic_id,
            topic_id: first.topic.topic_id,
            subject_id: first.topic.subject.subject_id,
            topic_name: first.topic.name,
            subject_name: first.topic.subject.name,
          });
        }
      }
    });
  }

  async generateFromPrompt() {
    if (this.loading) return;
    if (this.guidelinesEditorOpen) this.guidelinesEditorOpen = false;
    const { token, searchText, prompt } = this.promptForm.value;
    if (!prompt?.trim()) {
      this.toastr.warning('Prompt is required before generating problems.', 'Validation Failed'); return;
    }

    // ── Puter branch ─────────────────────────────────────────────────────────
    if (this.isPuterProvider) {
      if (!token?.trim()) {
        this.toastr.warning('Auth Token is required before generating problems.', 'Validation Failed'); return;
      }
      if (!searchText?.trim()) {
        this.toastr.warning('QB Search text is required before generating problems.', 'Validation Failed'); return;
      }
      this.loading = true;
      if (!sessionStorage.getItem('codSessionId')) {
        sessionStorage.setItem('codSessionId', crypto.randomUUID());
      }
      const pv = this.promptForm.getRawValue();
      const count = Math.max(1, parseInt(pv.count) || 1);
      const basePrompt = pv.prompt || `Generate ${count} unique scenario based ${pv.difficulty_level} level ${pv.language} programming description(s) on ${pv.topic}`;

      const exampleDetailed = `{
  "question_data": "<h3>Problem Statement: Bike Number Plate Verification System</h3><h4>Objective</h4><p>Create a Bike Number Plate Verification System using C# OOP principles...</p>",
  "inputformat": "<p>1. Number of bikes to be added to the system.</p>",
  "outputformat": "<p>For each bike, print the BikeID, Number Plate and whether the number plate is valid.</p>",
  "constraints": "<ul><li>1 ≤ N ≤ 1000</li><li>Number plate length: 6–10 characters</li><li>Time limit: 1 second</li></ul>",
  "manual_difficulty": "Easy",
  "language": "C#"
}`;
      const exampleSimple = `{
  "question_data": "<p><strong><u>Find the First Non-Repeating Character in a String</u></strong></p><p>Write a program that finds the first character that does not repeat.</p>",
  "inputformat": "<p>A single line containing a string s.</p>",
  "outputformat": "<ul><li>If a non-repeating character exists, print that character.</li><li>Otherwise, print: No non-repeating character found!</li></ul>",
  "constraints": "<ul><li>1 ≤ |s| ≤ 10<sup>5</sup></li><li>s contains only lowercase English letters</li></ul>",
  "manual_difficulty": "Easy",
  "language": "C#"
}`;
      const example = pv.format === 'simple' ? exampleSimple : exampleDetailed;

      const userContent = `${basePrompt}.

You are an AI that generates scenario-based programming questions in a structured JSON format.

Example item structure:
${example}

Rules:
- Be scenario-based (real-world context).
- Include a Title, Problem Description, and a clear Question section.
- Specify Classes/Methods if needed.
- Use HTML formatting for rich text (question_data, inputformat, outputformat, constraints).
- Each item must be unique — different scenario, different problem title, different logic.
- Do not repeat scenarios from previous responses.

Return a bare JSON array: [ ...your ${count} questions... ]
The array must contain exactly ${count} item(s).
Each item must have: "question_data", "inputformat", "outputformat", "constraints", "manual_difficulty" (Easy|Medium|Hard), "language".
Do not include any explanations, extra text, or markdown formatting — return only valid JSON.`;

      const guidelinesContent = this.useGuidelines ? this.guidelinesText : null;
      const systemContent = 'You are a COD Problem generator.' +
        (guidelinesContent ? `\n\nFOLLOW THESE QUESTION CREATION GUIDELINES STRICTLY:\n\n${guidelinesContent}` : '');

      try {
        const rawText = await this.callPuterAI([
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ], pv.model);
        let parsed = this.parsePuterJSON(rawText);
        if (!Array.isArray(parsed)) parsed = parsed.items || parsed.problems || [parsed];
        this.cods = parsed.map((item: any) => this.makeCod({ ...item, language: pv.language }));
        this.toastr.success(`${this.cods.length} problem(s) generated via Puter.`, 'Done');
        this.fetchSideData();
        this.codService.registerQuestions({
          questions: this.cods.map((c: any) => ({
            question_data: c.question_data,
            inputformat: c.inputformat || '',
            outputformat: c.outputformat || '',
            constraints: c.constraints || '',
            language: c.language,
          })),
          prompt: pv.prompt || '',
          topic: pv.topic || '',
          sessionId: sessionStorage.getItem('codSessionId') || '',
        }).subscribe({ next: () => this.getAllSessions(), error: () => {} });
      } catch (err: any) {
        this.toastr.error(err.message || 'Puter AI call failed.', 'Error');
      }
      this.loading = false;
      return;
    }

    // ── Backend branch ───────────────────────────────────────────────────────
    if (!token?.trim()) {
      this.toastr.warning('Auth Token is required before generating problems.', 'Validation Failed'); return;
    }
    if (!searchText?.trim()) {
      this.toastr.warning('QB Search text is required before generating problems.', 'Validation Failed'); return;
    }
    this.loading = true;
    const payload = { ...this.promptForm.getRawValue(), sessionId: sessionStorage.getItem('codSessionId'), useGuidelines: this.useGuidelines, guidelinesContent: this.activeGuidelinesContent };
    this.fetchSideData();
    this.codService.generateCods(payload).subscribe({
      next: (res: any) => {
        sessionStorage.setItem('codSessionId', res.response.sessionId);
        this.getAllSessions();
        this.cods = (res.response.result || []).map((cod: any) => this.makeCod(cod));
        this.accumulateUsage(res.usage);
        this.toastr.success(`${this.cods.length} problem(s) generated successfully.`, 'Done');
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.error || 'Failed to generate problems. Please try again.', 'Error');
        this.loading = false;
      }
    });
  }

  generateBatch() {
    if (this.batchLoading) return;
    const { token, searchText, prompt } = this.promptForm.value;
    if (!prompt?.trim()) {
      this.toastr.warning('Prompt is required before generating problems.', 'Validation Failed'); return;
    }
    if (!token?.trim()) {
      this.toastr.warning('Auth Token is required before generating problems.', 'Validation Failed'); return;
    }
    if (!searchText?.trim()) {
      this.toastr.warning('QB Search text is required before generating problems.', 'Validation Failed'); return;
    }
    this.batchLoading = true;
    const payload = {
      ...this.promptForm.getRawValue(),
      sessionId: sessionStorage.getItem('codSessionId'),
      autoValidate: true,
      useGuidelines: this.useGuidelines,
      guidelinesContent: this.activeGuidelinesContent,
    };
    this.fetchSideData();
    this.codService.generateBatch(payload).subscribe({
      next: (res: any) => {
        sessionStorage.setItem('codSessionId', res.sessionId);
        this.getAllSessions();
        const validCount = (res.results || []).filter((r: any) => r.status === 'valid').length;
        const total = (res.results || []).length;
        this.accumulateUsageLog(res.usageLog);
        this.toastr.success(`${total} problem(s) generated · ${validCount}/${total} validated.`, 'Batch Complete');
        this.cods = (res.results || []).map((item: any) => {
          const cod = this.makeCod(item.problem);
          const validation = item.validation;
          const samples = (item.solution?.samples || []).map((s: any, j: number) => {
            const valResult = validation?.results?.[j];
            return {
              input: s.input,
              output: valResult?.passed ? (valResult.actual_output ?? s.output) : s.output,
              difficulty: s.difficulty,
              score: s.score,
              error: valResult && !valResult.passed
                ? `Validation mismatch — Expected: "${s.output}" | Got: "${valResult.actual_output}"`
                : '',
              running: false,
              isSelected: false,
              hasRun: !!valResult,
              execTimeMs: valResult?.execTimeMs,
              memBytes: valResult?.memBytes ? String(valResult.memBytes) : '',
            };
          });
          return { ...cod, solution: item.solution?.solution_data || '', samples, validation, solutionGenerated: !!item.solution, batchStatus: item.status };
        });
        this.batchLoading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.error || 'Batch generation failed. Please try again.', 'Error');
        this.batchLoading = false;
      }
    });
  }

  async generateSolution(cod: any) {
    cod.solutionGenerating = true;
    cod.solutionError = '';
    const { provider, model } = this.promptForm.getRawValue();

    // ── Puter branch ─────────────────────────────────────────────────────────
    if (provider === 'puter') {
      const tcRules = this.useGuidelines
        ? `- Produce EXACTLY 9 distinct test cases ordered by ascending difficulty (Easy → Hard).
- Weightage MUST be in ascending order and total exactly 100. Use this pattern: Easy=10, Easy=10, Medium=15, Medium=15, Hard=25, Hard=25 (adjust if needed but total must be 100 and order must be ascending).
- From the 9 test cases, mark EXACTLY 2 to 3 as "isSampleIO": true — these are shown to students and must each cover a DIFFERENT output scenario (e.g. typical case, edge/boundary case, error/invalid case if applicable). Set "isSampleIO": false for the rest.
- No duplicate inputs or outputs across test cases.
- Manually verify each test case output against the solution logic.`
        : `- Produce 10 to 15 distinct sample input/output pairs that cover edge cases, with a score per sample summing to 100 (Easy=low, Medium=normal, Hard=high score).
- Add "isSampleIO": false to all samples (user will select manually).`;

      const userContent = `You are an assistant that must return ONLY valid JSON (no Markdown, no code fences, no commentary).
Infer the most appropriate programming language from the question; if unclear, default to Java.

Requirements:
- Provide a COMPLETE, RUNNABLE solution with ALL required imports.
- The program must read dynamic user input from STDIN and print to STDOUT exactly as specified.
- Do NOT include any placeholder text like "...", "your code here", etc.
- All special characters inside JSON strings (newlines, tabs, backslashes, double quotes) MUST be properly escaped.
${tcRules}
- Ensure the JSON is syntactically valid.
- STRICT JAVA RULE: If the language is Java, the public class name MUST be exactly "Main" (i.e. "public class Main"). No other class name is allowed as the entry point.
- STRICT C++ RULE: If the language is C++, use a standard "int main()" entry point. Include necessary headers (e.g. #include <iostream>, #include <vector>, etc.) and use "using namespace std;" for simplicity. The program must compile with g++ without errors.

Return JSON in this exact shape:
[ { "solution_data": "...", "samples": [...], "io_spec": {...} } ]

Where each item has:
- "solution_data": complete runnable source code as a properly escaped JSON string
- "samples": array of { "input": "...", "output": "...", "difficulty": "Easy|Medium|Hard", "score": number, "isSampleIO": boolean }
- "io_spec": { "input_format": "...", "output_format": "..." }

Question context:
question_data: ${cod.question_data}
inputformat: ${cod.inputformat}
outputformat: ${cod.outputformat}
constraints: ${cod.constraints || ''}
language: ${cod.language || 'Java'}

Return only valid JSON. No explanations, no markdown.`;

      const guidelinesContent = this.useGuidelines ? this.guidelinesText : null;
      const systemContent = 'You are a Compiler-based Problem Solution generator.' +
        (guidelinesContent ? `\n\nFOLLOW THESE QUESTION CREATION GUIDELINES STRICTLY (especially Parameter 7: Solution rules, Parameter 8: Hidden Test Cases rules):\n\n${guidelinesContent}` : '');

      try {
        const rawText = await this.callPuterAI([
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ], model);
        const parsed = this.parsePuterJSON(rawText);
        // Response is an array [ { solution_data, samples, io_spec } ]
        const item = Array.isArray(parsed) ? parsed[0] : (parsed.items?.[0] ?? parsed);
        cod.solution = item.solution_data || '';
        cod.samples = (item.samples || [])
          .filter((s: any) => s.input?.trim())
          .map((s: any) => ({
            input: s.input || '', output: s.output || '',
            difficulty: s.difficulty || 'Medium', score: s.score || 0,
            isSampleIO: !!s.isSampleIO, error: '', running: false,
            isSelected: this.useGuidelines ? !!s.isSampleIO : false,
            hasRun: false, execTimeMs: 0, memBytes: '',
          }));
        cod.solutionGenerated = true;
        cod.solutionVisible = true;
        this.codService.saveSolution({
          question_data: cod.question_data,
          solution_data: cod.solution,
          testcases: cod.samples.map((s: any) => ({ input: s.input, output: s.output, difficulty: s.difficulty, score: s.score, isSampleIO: !!s.isSampleIO })),
        }).subscribe({ error: () => {} });
        this.toastr.success('Solution generated via Puter.', 'Done');
      } catch (err: any) {
        cod.solutionError = 'Error generating solution via Puter.';
        this.toastr.error(err.message || 'Puter AI call failed.', 'Error');
      }
      cod.solutionGenerating = false;
      return;
    }

    // ── Backend branch ───────────────────────────────────────────────────────
    this.codService.generateSolution({ ...cod, provider, model, useGuidelines: this.useGuidelines, guidelinesContent: this.activeGuidelinesContent }, true).subscribe({
      next: (res: any) => {
        const solution = res.response[0];
        const validation = res.validation || null;
        cod.solution = solution.solution_data;
        const rawSamples = (solution.samples || []).map((s: any, j: number) => {
          const valResult = validation?.results?.[j];
          return {
            input: s.input,
            output: valResult?.passed ? (valResult.actual_output ?? s.output) : s.output,
            difficulty: s.difficulty,
            score: s.score,
            isSampleIO: s.isSampleIO,
            error: valResult && !valResult.passed
              ? `Validation mismatch — Expected: "${s.output}" | Got: "${valResult.actual_output}"`
              : '',
            running: false,
            isSelected: this.useGuidelines ? (s.isSampleIO === true) : false,
            hasRun: !!valResult,
            execTimeMs: valResult?.execTimeMs || 0,
            memBytes: valResult?.memBytes ? String(valResult.memBytes) : '',
            _origIdx: j,
          };
        }).filter((s: any) => s.input?.trim());
        cod.samples = rawSamples.map(({ _origIdx, ...s }: any) => s);
        cod.validation = validation
          ? { ...validation, results: rawSamples.map((s: any) => validation.results?.[s._origIdx] ?? null) }
          : null;
        cod.solutionGenerated = true;
        cod.solutionVisible = true;
        cod.solutionGenerating = false;
        this.accumulateUsage(res.usage);
      },
      error: (err: any) => {
        cod.solutionError = 'Error generating solution. Please try again.';
        cod.solutionGenerating = false;
        this.toastr.error(err.error?.error || 'Failed to generate solution.', 'Error');
      }
    });
  }

  async regenerateTestcases(cod: any) {
    if (!cod.solution) {
      this.toastr.warning('Generate a solution first before regenerating test cases.', 'No Solution'); return;
    }
    const count = this.useGuidelines ? 6 : (cod.tcCount || 15);
    cod.tcRegenerating = true;
    const { provider, model } = this.promptForm.getRawValue();

    // ── Puter branch ─────────────────────────────────────────────────────────
    if (provider === 'puter') {
      const n = this.useGuidelines ? 9 : Math.max(1, Math.min(50, parseInt(count) || 15));

      const guidelinesRules = this.useGuidelines
        ? `- Generate EXACTLY 9 test cases ordered by ascending difficulty: 3 Easy, 3 Medium, 3 Hard.
- Weightage in ASCENDING order totalling exactly 100: Easy=10, Easy=10, Easy=10, Medium=15, Medium=15, Medium=15, Hard=25, Hard=25, Hard=25.
- No duplicate inputs or outputs across the 9 test cases.
- Manually verify each test case output against the solution logic.
- Select EXACTLY 2 to 3 test cases as "samples" (shown to students). Each sample must cover a DIFFERENT output scenario (e.g. typical, edge/boundary, error/invalid). They must be a subset of testcases.`
        : `- Scores of ALL test cases must sum to exactly 100.
- Select 2 to 5 representative test cases as "samples" covering all possible input/output patterns.`;

      const userContent = `You are a test-case generator. Return ONLY valid JSON — no Markdown, no code fences, no commentary.

Task: Given the problem description and the reference solution below, generate exactly ${n} distinct test cases.

Rules:
- Each test case must have: "input", "output", "difficulty" (Easy|Medium|Hard), "score" (number).
- The "output" must be the EXACT output produced by running the provided solution against the "input".
- Cover a wide range of scenarios: minimum values, maximum values, edge cases, typical cases, stress cases.
${guidelinesRules}
- The "samples" array must be a SUBSET of "testcases" (same input/output values).

Return this exact JSON shape:
{ "testcases": [...], "samples": [...] }

Where:
- "testcases": array of all ${n} test cases: [{ "input": "...", "output": "...", "difficulty": "Easy|Medium|Hard", "score": number }]
- "samples": array of selected sample I/O test cases (subset, same shape)

Problem:
${cod.question_data}

Language: ${cod.language || 'Java'}

Reference Solution:
${cod.solution}

Return only valid JSON. No explanations.`;

      const guidelinesContent = this.useGuidelines ? this.guidelinesText : null;
      const systemContent = 'You are a test-case generator for programming problems.' +
        (guidelinesContent ? `\n\nFOLLOW THESE QUESTION CREATION GUIDELINES STRICTLY (especially Parameter 5: Sample Input, Parameter 6: Sample Output, Parameter 8: Hidden Test Cases rules):\n\n${guidelinesContent}` : '');

      try {
        const rawText = await this.callPuterAI([
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ], model);
        const parsed = this.parsePuterJSON(rawText);
        const inner = parsed?.items ?? parsed;
        const sampleInputs = new Set((inner.samples || []).map((s: any) => s.input?.trim()));
        cod.samples = (inner.testcases || inner.samples || [])
          .filter((s: any) => s.input?.trim())
          .map((s: any) => ({
            input: s.input || '', output: s.output || '',
            difficulty: s.difficulty || 'Medium', score: s.score || 0,
            error: '', running: false, hasRun: false,
            isSelected: sampleInputs.has(s.input?.trim()),
            execTimeMs: 0, memBytes: '',
          }));
        this.redistributeScores(cod);
        this.toastr.success(`${cod.samples.length} test case(s) generated via Puter.`, 'Done');
      } catch (err: any) {
        this.toastr.error(err.message || 'Puter AI call failed.', 'Error');
      }
      cod.tcRegenerating = false;
      return;
    }

    // ── Backend branch ───────────────────────────────────────────────────────
    this.codService.regenerateTestcases({
      question_data: cod.question_data,
      solution_data: cod.solution,
      language: cod.language,
      count,
      provider,
      model,
      useGuidelines: this.useGuidelines,
      guidelinesContent: this.activeGuidelinesContent,
    }).subscribe({
      next: (res: any) => {
        const data = res.response;
        const validation = res.validation;
        const sampleInputs = new Set((data.samples || []).map((s: any) => s.input?.trim()));

        const allTc: any[] = (data.testcases || []).map((s: any, j: number) => {
          const valResult = validation?.results?.[j];
          return {
            input: s.input,
            output: valResult?.passed ? (valResult.actual_output ?? s.output) : s.output,
            difficulty: s.difficulty,
            score: s.score,
            error: valResult && !valResult.passed
              ? `Validation mismatch — Expected: "${s.output}" | Got: "${valResult.actual_output}"`
              : '',
            running: false,
            hasRun: !!valResult,
            isSelected: sampleInputs.has(s.input?.trim()),
            execTimeMs: valResult?.execTimeMs || 0,
            memBytes: valResult?.memBytes ? String(valResult.memBytes) : '',
            _origIdx: j,
          };
        }).filter((s: any) => s.input?.trim());

        cod.samples = allTc.map(({ _origIdx, ...s }: any) => s);
        cod.validation = validation
          ? { ...validation, results: allTc.map((s: any) => validation.results?.[s._origIdx] ?? null) }
          : null;
        this.redistributeScores(cod);
        cod.tcRegenerating = false;
        this.accumulateUsage(res.usage);

        const passed = validation?.passed_count ?? 0;
        const total = validation?.total ?? allTc.length;
        this.toastr.success(
          `${allTc.length} test case(s) regenerated · ${passed}/${total} validated · ${sampleInputs.size} sample I/O selected.`,
          'Done'
        );
      },
      error: (err: any) => {
        this.toastr.error(err.error?.error || 'Failed to regenerate test cases.', 'Error');
        cod.tcRegenerating = false;
      }
    });
  }

  runCode(cod: any) {
    cod.runcode = true;
    cod.codeOutput = '';
    cod.outputerror = '';
    this.codService.runCode({ code: cod.solution, input: cod.input, language: cod.language }).subscribe({
      next: (res: any) => {
        cod.codeOutput = res.output || '';
        if (res.error) cod.outputerror = `${res.error}${res.details ? ': ' + res.details : ''}`;
        cod.runcode = false;
      },
      error: () => { cod.outputerror = 'Error running code'; cod.runcode = false; }
    });
  }

  runSample(cod: any, sample: any, index?: number) {
    sample.running = true;
    sample.output = '';
    sample.error = '';
    this.codService.runCode({ code: cod.solution, input: sample.input, language: cod.language }).subscribe({
      next: (res: any) => {
        sample.output = res.output + '\n' || '';
        sample.execTimeMs = res.timeBytes || 0;
        sample.memBytes = String(res.memBytes || '');
        if (res.error) sample.error = `${res.error}${res.details ? ': ' + res.details : ''}`;
        sample.hasRun = true;
        sample.running = false;
        if (index !== undefined) {
          if (!cod.validation) cod.validation = { results: new Array(cod.samples.length).fill(null) };
          cod.validation.results[index] = { passed: !res.error, actual_output: res.output };
          this.syncValidationSummary(cod);
        }
      },
      error: () => {
        sample.error = 'Error executing code';
        sample.hasRun = true;
        sample.running = false;
        if (index !== undefined) {
          if (!cod.validation) cod.validation = { results: new Array(cod.samples.length).fill(null) };
          cod.validation.results[index] = { passed: false, actual_output: '' };
          this.syncValidationSummary(cod);
        }
      }
    });
  }

  private syncValidationSummary(cod: any) {
    if (!cod.validation) {
      cod.validation = { results: new Array(cod.samples.length).fill(null) };
    }
    const results: any[] = cod.validation.results || [];
    cod.validation.total = cod.samples.length;
    cod.validation.passed_count = cod.samples.filter((_: any, i: number) => results[i]?.passed === true).length;
    cod.validation.failed_count = cod.samples.filter((_: any, i: number) => results[i] != null && results[i].passed !== true).length;
  }

  async runAllSamples(cod: any) {
    if (cod.runningAll) return;
    cod.runningAll = true;
    for (let idx = 0; idx < cod.samples.length; idx++) {
      const sample = cod.samples[idx];
      await new Promise<void>((resolve) => {
        sample.running = true;
        sample.error = '';
        this.codService.runCode({ code: cod.solution, input: sample.input, language: cod.language }).subscribe({
          next: (res: any) => {
            sample.output = res.output + '\n' || '';
            sample.execTimeMs = res.execTimeMs || 0;
            sample.memBytes = String(res.memBytes || '');
            if (res.error) sample.error = `${res.error}${res.details ? ': ' + res.details : ''}`;
            sample.hasRun = true;
            sample.running = false;
            if (!cod.validation) cod.validation = { results: new Array(cod.samples.length).fill(null) };
            cod.validation.results[idx] = { passed: !res.error, actual_output: res.output };
            resolve();
          },
          error: () => {
            sample.error = 'Error executing code';
            sample.hasRun = true;
            sample.running = false;
            if (!cod.validation) cod.validation = { results: new Array(cod.samples.length).fill(null) };
            cod.validation.results[idx] = { passed: false, actual_output: '' };
            resolve();
          }
        });
      });
    }
    cod.runningAll = false;
    this.syncValidationSummary(cod);
  }

  setPrompt(text: string) {
    this.promptForm.patchValue({ prompt: text });
  }

  async refineQuestion(cod: any) {
    if (!cod.refinePrompt?.trim()) {
      this.toastr.warning('Enter a refine instruction before updating.', 'Input Required'); return;
    }
    cod.refining = true;
    const { provider, model } = this.promptForm.getRawValue();

    // ── Puter branch ─────────────────────────────────────────────────────────
    if (provider === 'puter') {
      const userContent = `You are an AI that refines existing programming questions based on user instructions.

Existing question:
question_data: ${cod.question_data}
inputformat: ${cod.inputformat || ''}
outputformat: ${cod.outputformat || ''}
constraints: ${cod.constraints || ''}
language: ${cod.language || 'Java'}

User instruction: ${cod.refinePrompt}

Apply the instruction to update the question. Keep all fields and formatting intact unless the instruction specifically changes them.
Use HTML formatting for rich text (question_data, inputformat, outputformat, constraints).
The updated question must still be scenario-based with a clear Title, Problem Description, and Question section.

Return a single JSON object (not an array): { ...updated question... }
The object must have: "question_data", "inputformat", "outputformat", "constraints", "manual_difficulty" (Easy|Medium|Hard), "language".
Return only valid JSON. No explanations, no markdown.`;

      const guidelinesContent = this.useGuidelines ? this.guidelinesText : null;
      const systemContent = 'You are a COD Problem refiner.' +
        (guidelinesContent ? `\n\nFOLLOW THESE QUESTION CREATION GUIDELINES STRICTLY:\n\n${guidelinesContent}` : '');

      try {
        const rawText = await this.callPuterAI([
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ], model);
        const updated = this.parsePuterJSON(rawText);
        const item = updated?.item ?? updated;
        cod.question_data     = item.question_data     ?? cod.question_data;
        cod.inputformat       = item.inputformat       ?? cod.inputformat;
        cod.outputformat      = item.outputformat      ?? cod.outputformat;
        cod.constraints       = item.constraints       ?? cod.constraints;
        cod.manual_difficulty = item.manual_difficulty ?? cod.manual_difficulty;
        cod.refinePrompt = '';
        this.toastr.success('Question updated via Puter.', 'Refined');
      } catch (err: any) {
        this.toastr.error(err.message || 'Puter AI call failed.', 'Error');
      }
      cod.refining = false;
      return;
    }

    // ── Backend branch ───────────────────────────────────────────────────────
    this.codService.refineCod({
      question_data: cod.question_data,
      inputformat: cod.inputformat,
      outputformat: cod.outputformat,
      constraints: cod.constraints,
      language: cod.language,
      refine_prompt: cod.refinePrompt,
      provider,
      model,
      useGuidelines: this.useGuidelines,
      guidelinesContent: this.activeGuidelinesContent,
    }).subscribe({
      next: (res: any) => {
        const updated = res.response;
        cod.question_data = updated.question_data ?? cod.question_data;
        cod.inputformat = updated.inputformat ?? cod.inputformat;
        cod.outputformat = updated.outputformat ?? cod.outputformat;
        cod.constraints = updated.constraints ?? cod.constraints;
        cod.manual_difficulty = updated.manual_difficulty ?? cod.manual_difficulty;
        cod.language = updated.language ?? cod.language;
        cod.refinePrompt = '';
        cod.refining = false;
        this.accumulateUsage(res.usage);
        this.toastr.success('Question updated successfully.', 'Refined');
      },
      error: (err: any) => {
        this.toastr.error(err.error?.error || 'Failed to refine question.', 'Error');
        cod.refining = false;
      }
    });
  }

  toggleDebugging(cod: any) {
    cod.debuggingMode = !cod.debuggingMode;
    if (cod.debuggingMode && !cod.debugSolution) {
      cod.debugSolution = cod.solution;
    }
  }

  async runAllDebugSamples(cod: any) {
    if (cod.debugRunningAll) return;
    if (!cod.debugSolution?.trim()) {
      this.toastr.warning('Generate or write debug code first.', 'No Debug Code'); return;
    }
    if (!cod.samples?.length) {
      this.toastr.warning('No test cases to run debug against.', 'No Test Cases'); return;
    }
    cod.debugRunningAll = true;
    for (const sample of cod.samples) {
      await new Promise<void>((resolve) => {
        sample.debugRunning = true;
        sample.debugOutput = '';
        sample.debugError = '';
        sample.debugMatchesExpected = null;
        this.codService.runCode({ code: cod.debugSolution, input: sample.input, language: cod.language }).subscribe({
          next: (res: any) => {
            sample.debugOutput = res.output || '';
            sample.debugError = res.error ? `${res.error}${res.details ? ': ' + res.details : ''}` : '';
            const expected = (sample.output || '').trim();
            const actual = (sample.debugOutput || '').trim();
            // true = SAME output (bug not effective), false = DIFFERENT output (bug works)
            sample.debugMatchesExpected = expected !== '' && (expected === actual);
            sample.debugRunning = false;
            resolve();
          },
          error: () => {
            sample.debugError = 'Error running debug code';
            sample.debugRunning = false;
            sample.debugMatchesExpected = null;
            resolve();
          }
        });
      });
    }
    cod.debugRunningAll = false;
    const ran = cod.samples.filter((s: any) => s.debugMatchesExpected !== null && s.debugMatchesExpected !== undefined);
    const effective = ran.filter((s: any) => s.debugMatchesExpected === false).length;
    const total = ran.length;
    if (effective === total && total > 0) {
      this.toastr.success(`All ${total} TCs produce wrong output — bugs are effective!`, 'Debug Check');
    } else if (effective > 0) {
      this.toastr.info(`${effective}/${total} TCs produce wrong output.`, 'Debug Check');
    } else {
      this.toastr.warning('All TCs produce same output as solution — bugs may not be effective!', 'Debug Check');
    }
  }

  async generateDebugCode(cod: any) {
    if (!cod.solution) {
      this.toastr.warning('Generate a solution first before creating debug code.', 'No Solution'); return;
    }
    cod.debugGenerating = true;
    const { provider, model } = this.promptForm.getRawValue();

    // ── Puter branch ─────────────────────────────────────────────────────────
    if (provider === 'puter') {
      const tcSection = cod.samples?.length
        ? `\n\nTest Cases (your buggy code MUST produce WRONG output for at least 70% of these — use them to verify effectiveness):\n${
            (cod.samples as any[]).slice(0, 10).map((tc: any, i: number) =>
              `TC${i + 1} [${tc.difficulty || 'Medium'}]:\n  Input: ${tc.input}\n  Expected (correct) output: ${tc.output}`
            ).join('\n')
          }`
        : '';
      const userContent = `You are a programming instructor creating a debugging exercise for students.

Given the CORRECT solution below, produce a BUGGY version that has EXACTLY ${cod.debugBugCount || 3} intentional, subtle error(s) students must find and fix.

Rules:
- Introduce EXACTLY ${cod.debugBugCount || 3} bug(s) — no more, no less.
- Preserve the overall structure, class names, method signatures, and all imports exactly.
- Introduce LOGICAL bugs only (wrong operator, off-by-one, wrong variable used, wrong condition, missing/extra step) — NOT syntax errors.
- The buggy code must still COMPILE successfully but produce WRONG output for most inputs.
- Do NOT add any comments, markers, or hints about where the bugs are.
- The bugs must be EFFECTIVE: when run against the provided test cases, the buggy code must produce incorrect output for the majority of them.
- Return ONLY valid JSON in this exact shape: { "debug_code": "..." }
  where "debug_code" is the complete buggy source code as a properly escaped JSON string.${tcSection}${cod.debugPrompt?.trim() ? `\n\nAdditional requirements from instructor:\n${cod.debugPrompt.trim()}` : ''}

Language: ${cod.language || 'Java'}

Problem:
${cod.question_data}

Correct Solution:
${cod.solution}

Return only valid JSON. No explanations, no markdown.`;

      try {
        const rawText = await this.callPuterAI([
          { role: 'system', content: 'You are a programming instructor creating debugging exercises. Return only valid JSON, no markdown.' },
          { role: 'user', content: userContent }
        ], model);
        const parsed = this.parsePuterJSON(rawText);
        const inner = parsed?.items ?? parsed;
        cod.debugSolution = inner.debug_code || '';
        this.codService.saveDebugCode({
          question_data: cod.question_data,
          debug_code: cod.debugSolution,
        }).subscribe({ error: () => {} });
        this.toastr.success('Debug code generated via Puter.', 'Done');
      } catch (err: any) {
        this.toastr.error(err.message || 'Puter AI call failed.', 'Error');
      }
      cod.debugGenerating = false;
      return;
    }

    // ── Backend branch ───────────────────────────────────────────────────────
    this.codService.generateDebugCode({
      solution_data: cod.solution,
      question_data: cod.question_data,
      language: cod.language,
      testcases: (cod.samples || []).map((s: any) => ({ input: s.input, output: s.output, difficulty: s.difficulty })),
      bug_count: cod.debugBugCount || 3,
      debug_prompt: cod.debugPrompt || '',
      provider,
      model,
    }).subscribe({
      next: (res: any) => {
        cod.debugSolution = res.debugCode || '';
        cod.debugGenerating = false;
        this.accumulateUsage(res.usage);
        this.toastr.success('Debug code generated.', 'Done');
      },
      error: (err: any) => {
        this.toastr.error(err.error?.error || 'Failed to generate debug code.', 'Error');
        cod.debugGenerating = false;
      }
    });
  }

  toggleSampleSelection(cod: any, sample: any) {
    sample.isSelected = !sample.isSelected;
    this.redistributeScores(cod);
  }

  private redistributeScores(cod: any) {
    const scorable = cod.samples.filter((s: any) => !s.isSelected);
    if (scorable.length === 0) return;

    const difficultyWeight: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };
    const totalUnits = scorable.reduce((sum: number, s: any) =>
      sum + (difficultyWeight[(s.difficulty as string)] ?? 1), 0);

    let assigned = 0;
    scorable.forEach((s: any, i: number) => {
      const units = difficultyWeight[(s.difficulty as string)] ?? 1;
      const isLast = i === scorable.length - 1;
      s.score = isLast ? (100 - assigned) : Math.floor((units / totalUnits) * 100);
      assigned += s.score;
    });
  }

  addSample(cod: any) {
    cod.samples.push({ input: '', output: '', error: '', running: false, isSelected: false, score: 0, difficulty: 'Easy', hasRun: false });
  }

  deleteSample(cod: any, index: number) {
    cod.samples.splice(index, 1);
    if (cod.validation?.results) {
      cod.validation.results.splice(index, 1);
    }
    if (cod.validation) this.syncValidationSummary(cod);
  }

  uploadCOD(cod: any) {
    if (cod.samples.some((s: any) => !s.hasRun)) {
      this.toastr.warning('Please run all test cases at least once before uploading. Use "▶▶ Run All" to execute them.', 'Tests Not Run'); return;
    }
    if (cod.samples.some((s: any) => s.error)) {
      this.toastr.warning('Please resolve all sample errors before uploading.', 'Validation Failed'); return;
    }
    if (!this.selectedQbId && !this.promptForm.value.qb_id) {
      this.toastr.warning('Please select a Question Bank from the dropdown or enter a valid QB ID in the form.', 'Validation Failed'); return;
    }
    const testcases = cod.samples.filter((s: any) => !s.isSelected).map((s: any) => ({
      input: s.input, output: s.output, memBytes: s.memBytes || '0', timeBytes: s.execTimeMs || 0,
      difficulty: s.difficulty || 'Medium', score: s.score || 0, timeLimit: null, outputLimit: null, memoryLimit: null
    }));
    const totalScore = testcases.reduce((sum: number, tc: any) => sum + Number(tc.score || 0), 0);
    if (totalScore !== 100) { this.toastr.warning(`Test case scores must total 100. Currently: ${totalScore}`, 'Score Mismatch'); return; }
    const sampleIo = cod.samples.filter((s: any) => s.isSelected).map((s: any) => ({
      input: s.input, output: s.output, memBytes: s.memBytes || '0', timeBytes: s.execTimeMs || 0,
      sample: 'Yes', difficulty: ' - ', score: ' - ', timeLimit: null, outputLimit: null, memoryLimit: null
    }));
    if (sampleIo.length === 0) { this.toastr.warning('Please mark at least one test case as sample I/O before uploading.', 'Validation Failed'); return; }
    const vals = this.promptForm.getRawValue();
    const payload = {
      question_type: 'programming', question_data: cod.question_data, question_editor_type: 1,
      multilanguage: [cod.language], inputformat: cod.inputformat, outputformat: cod.outputformat,
      // constraints: cod.constraints || '',
      enablecustominput: true, line_token_evaluation: false,
      codeconstraints: cod.constraints || '', timelimit: null, memorylimit: null, codesize: null,
      setLimit: false, enable_api: false, outputLimit: null,
      subject_id: vals.subject_id || '',
      blooms_taxonomy: null, course_outcome: null, program_outcome: null, hint: [],
      manual_difficulty: cod.manual_difficulty || 'Medium',
      solution: [{ language: cod.language, whitelist: [{ list: [] }], hasSnippet: false,
        // codeStub - code inside the debug editor needs to be passed here only if the debug check box is enabled and if the checkbox is disabled then codeStub should not be passed in the payload itself because in that case we will not show the debug editor in the frontend and we should not pass any codeStub to the backend as well
        codeStub: (cod.debuggingMode && cod.debugSolution) ? cod.debugSolution : '',
        solutiondata: [{ solution: cod.solution || '', solutionExp: null, solutionbest: true, isSolutionExp: false, solutionDebug: cod.solution || '' }],
        hideHeader: false, hideFooter: false }],
      testcases,
      topic_id: vals.topic_id || '', sub_topic_id: vals.sub_topic_id || '',
      linked_concepts: '', sample_io: JSON.stringify(sampleIo),
      question_media: [], pcm_combination_ids: [''],
      qb_id: this.selectedQbId || vals.qb_id || '',
      createdBy: '', imported: 'is_imported_question',
      tags: ["cod-genius"],
      language: cod.language || '',
      topic: vals.topic || '',
      sessionId: sessionStorage.getItem('codSessionId') || '',
      prompt: vals.prompt || '',
    };
    this.codService.uploadCods(payload, this.promptForm.value.token).subscribe({
      next: (res: any) => {
        if (res.response[0].status === 'Uploaded') {
          cod.upload = true;
          this.toastr.success('Question uploaded to platform successfully!', 'Uploaded');
        } else {
        this.toastr.error('Upload error: ' + (res.response[0].error?.message || 'Unknown error'), 'Upload Error');
          this.toastr.error('Upload failed. Please try again.', 'Upload Error');
        }
      },
      error: (err: any) => {
        console.log(err);
        
        this.toastr.error('Upload error: ' + (err.error?.message || 'Unknown error'), 'Upload Error');
      }
    });
  }

  difficultyColor(d: string): string {
    return d === 'Hard' ? '#ef4444' : d === 'Medium' ? '#f59e0b' : '#10b981';
  }

  hasDebugBeenRun(samples: any[]): boolean {
    return samples.some(s => s.debugMatchesExpected !== undefined && s.debugMatchesExpected !== null);
  }

  trackByCod(index: number): number { return index; }
  trackBySample(index: number): number { return index; }
}

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

  availableModels: { groq: any[]; azure: any[] } = { groq: [], azure: [] };
  providerModels: any[] = [];

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

  constructor(private fb: FormBuilder, private codService: CodServiceService, private authService: AuthService, private toastr: ToastrService) {
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
      this.providerModels = this.availableModels[p as 'groq' | 'azure'] || [];
      this.promptForm.patchValue({ model: this.providerModels[0]?.id || '' });
    });
  }

  loadModels() {
    this.codService.getModels().subscribe({
      next: (res: any) => {
        this.availableModels = res;
        const currentProvider = this.promptForm.value.provider as 'groq' | 'azure';
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
      debugSolution: '',
      debugGenerating: false,
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

  generateFromPrompt() {
    if (this.loading) return;
    // this.guidelinesEditorOpen = !this.guidelinesEditorOpen
    if (this.guidelinesEditorOpen)  this.guidelinesEditorOpen = false;
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

  generateSolution(cod: any) {
    cod.solutionGenerating = true;
    cod.solutionError = '';
    const { provider, model } = this.promptForm.getRawValue();
    this.codService.generateSolution({ ...cod, provider, model, useGuidelines: this.useGuidelines, guidelinesContent: this.activeGuidelinesContent }, true).subscribe({
      next: (res: any) => {
        const solution = res.response[0];
        const validation = res.validation || null;
        cod.solution = solution.solution_data;
        cod.samples = (solution.samples || []).map((s: any, j: number) => {
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
          };
        });
        cod.validation = validation;
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

  regenerateTestcases(cod: any) {
    if (!cod.solution) {
      this.toastr.warning('Generate a solution first before regenerating test cases.', 'No Solution'); return;
    }
    const count = this.useGuidelines ? 6 : (cod.tcCount || 15);
    cod.tcRegenerating = true;
    const { provider, model } = this.promptForm.getRawValue();
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
          };
        });

        cod.samples = allTc;
        cod.validation = validation || null;
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

  runSample(cod: any, sample: any) {
    sample.running = true;
    sample.output = '';
    sample.error = '';
    this.codService.runCode({ code: cod.solution, input: sample.input, language: cod.language }).subscribe({
      next: (res: any) => {
        sample.output = res.output+'\n' || '';
        sample.execTimeMs = res.timeBytes || 0;
        sample.memBytes = String(res.memBytes || '');
        if (res.error) sample.error = `${res.error}${res.details ? ': ' + res.details : ''}`;
        sample.hasRun = true;
        sample.running = false;
      },
      error: () => { sample.error = 'Error executing code'; sample.hasRun = true; sample.running = false; }
    });
  }

  async runAllSamples(cod: any) {
    if (cod.runningAll) return;
    cod.runningAll = true;
    for (const sample of cod.samples) {
      await new Promise<void>((resolve) => {
        sample.running = true;
        sample.error = '';
        this.codService.runCode({ code: cod.solution, input: sample.input, language: cod.language }).subscribe({
          next: (res: any) => {
            // sample.output = res.output || '';
            sample.output = res.output+'\n' || '';
            sample.execTimeMs = res.execTimeMs || 0;
            sample.memBytes = String(res.memBytes || '');
            if (res.error) sample.error = `${res.error}${res.details ? ': ' + res.details : ''}`;
            sample.hasRun = true;
            sample.running = false;
            resolve();
          },
          error: () => { sample.error = 'Error executing code'; sample.hasRun = true; sample.running = false; resolve(); }
        });
      });
    }
    cod.runningAll = false;
  }

  setPrompt(text: string) {
    this.promptForm.patchValue({ prompt: text });
  }

  refineQuestion(cod: any) {
    if (!cod.refinePrompt?.trim()) {
      this.toastr.warning('Enter a refine instruction before updating.', 'Input Required'); return;
    }
    cod.refining = true;
    const { provider, model } = this.promptForm.getRawValue();
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

  generateDebugCode(cod: any) {
    if (!cod.solution) {
      this.toastr.warning('Generate a solution first before creating debug code.', 'No Solution'); return;
    }
    cod.debugGenerating = true;
    const { provider, model } = this.promptForm.getRawValue();
    this.codService.generateDebugCode({
      solution_data: cod.solution,
      question_data: cod.question_data,
      language: cod.language,
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

  deleteSample(cod: any, index: number) { cod.samples.splice(index, 1); }

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
      tags: ["cod-genius"]
    };
    this.codService.uploadCods(payload, this.promptForm.value.token).subscribe({
      next: (res: any) => {
        if (res.response[0].status === 'Uploaded') {
          cod.upload = true;
          this.toastr.success('Question uploaded to platform successfully!', 'Uploaded');
        } else {
          this.toastr.error('Upload failed. Please try again.', 'Upload Error');
        }
      },
      error: (err: any) => {
        this.toastr.error('Upload error: ' + (err.error?.message || 'Unknown error'), 'Upload Error');
      }
    });
  }

  difficultyColor(d: string): string {
    return d === 'Hard' ? '#ef4444' : d === 'Medium' ? '#f59e0b' : '#10b981';
  }

  trackByCod(index: number): number { return index; }
  trackBySample(index: number): number { return index; }
}

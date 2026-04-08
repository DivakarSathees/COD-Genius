import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { McqServiceService } from '../../services/mcq-service.service';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MonacoEditorModule, MONACO_PATH, MonacoEditorComponent, MonacoEditorConstructionOptions, MonacoStandaloneCodeEditor } from '@materia-ui/ngx-monaco-editor';
import { editor, languages } from 'monaco-editor';
import { NgSelectModule } from '@ng-select/ng-select';


@Component({
  selector: 'app-mcq-generator',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HttpClientModule, MonacoEditorModule, NgSelectModule ],
	// providers: [{
	// 	provide: MONACO_PATH,
	// 	useValue: 'https://unpkg.com/monaco-editor@0.20.0/min/vs'
	// }],
  templateUrl: './mcq-generator.component.html',
  styleUrl: './mcq-generator.component.css'
})
export class McqGeneratorComponent implements OnInit {
  ngOnInit() {
   
  }
  questionBanks: any[] = [];
  filteredQuestionBanks: any[] = [];
  uniqueCreators: string[] = [];
  selectedCreator: string = '';
  selectedQbId: string | null = null;

  searchText = '';
  subtopics: any[] = [];
copiedIndex: number | null = null;
  mcqForm: FormGroup;
  promptForm: FormGroup;
  mcqs: any[] = [];
  loading = false;
  verifing = false;
  uploading = false;
  codeOutput: string = '';
  error = '';
  outputerror = '';
  customPrompt = '';
  mode: 'form' | 'prompt' = 'form';
  language = '';
  token: any;
  // editorOptions = { theme: 'vs-dark', language: 'java' };
  editorOptions = {theme: 'vs-dark', language: 'csharp'};
  code: string= '';

  constructor(private fb: FormBuilder, private mcqService: McqServiceService) {
    this.mcqForm = this.fb.group({
      question_count: [5, Validators.required],
      options_count: [4, Validators.required],
      difficulty_level: ['Easy', Validators.required],
      code_snippet: [0, Validators.required],
      topic: ['', Validators.required],
      token: ['', Validators.required ], // Token for authentication
      qb_id: [''], // Question bank ID
      searchText: [''],
      // createdBy: [''], // Creator's name or ID
      // codeOutput: [''], // Output for code execution
      sub_topic_id: [''],
      topic_id: [''],
      subject_id: [''],
      topic_name: [''],
      subject_name: [''],
    });

    this.promptForm = this.fb.group({
      prompt: ['', Validators.required],
      token: ['', Validators.required], // Token for authentication
      qb_id: [''], // Question bank ID
      searchText: [''],
      code_snippet: [0, Validators.required],
    });
  }

  getQuestionText(fullText: string): string {
    return fullText?.split('$$$examly')[0]?.trim() || '';
  }

  getCodeSnippet(fullText: string): string {
    return fullText?.split('$$$examly')[1]?.trim() || '';
  }

  combineQuestionAndCode(question: string, code: string, codeVisible: boolean): string {
    if (codeVisible) {
      return `${question}$$$examly${code}`;
    } else {
      return question;
    }
  }

  generateFromForm() {
    this.loading = true;
    this.error = '';
    const payload = this.mcqForm.value;
    this.selectedQbId = '';

    const qbPayload = {
      search: this.mcqForm.value.searchText,
      authToken: this.mcqForm.value.token,
    };

    this.mcqService.getQuestionBanks(qbPayload).subscribe({
    next: (res: any) => {
      this.questionBanks = res.results.questionbanks || [];
      this.filteredQuestionBanks = [...this.questionBanks]; // initially no filter
      this.extractUniqueCreators();
    },
    error: (err) => {
      console.error('Error fetching QBs:', err);
    }
  });

    this.mcqService.generateMcqs(payload).subscribe({
      next: (res: any) => {
      this.mcqs = res.response.map((mcq: any) => ({
          ...mcq,
          questionText: this.getQuestionText(mcq.question_data),
          codeSnippet: this.getCodeSnippet(mcq.question_data),
          codeVisible: !!this.getCodeSnippet(mcq.question_data), // default visibility
          codeOutput: '', // Initialize code output
          outputerror: '', // Initialize output error,
          language: '',
          runcode: false, // Initialize run code flag
        }));
        this.loading = false;
        console.log(this.mcqs);
        
      },
      error: (err) => {
        this.error = 'Something went wrong';
        this.loading = false;
      },
    });

    // call the getTopics() method to fetch topics
    this.mcqService.getTopics(this.mcqForm.value.token).subscribe({
      next: (res: any) => {
        console.log(res);
        this.subtopics = res.data;

      if (this.subtopics.length > 0) {
        const first = this.subtopics[0];
        this.mcqForm.patchValue({
          sub_topic_id: first.sub_topic_id,
          topic_id: first.topic.topic_id,
          subject_id: first.topic.subject.subject_id,
          topic_name: first.topic.name,
          subject_name: first.topic.subject.name,

        });
      }
      console.log(this.mcqForm.value);
      
      },
      error: (err) => {
        console.error('Error fetching topics:', err);
      },
    });
  }
  selectQB(qb: any) {
    this.selectedQbId = qb.qb_id;
  }

  extractUniqueCreators() {
  const creators = this.questionBanks.map(qb => qb.createdBy).filter(Boolean);
  this.uniqueCreators = Array.from(new Set(creators));
}

filterByCreator() {
  if (this.selectedCreator) {
    this.filteredQuestionBanks = this.questionBanks.filter(
      qb => qb.createdBy === this.selectedCreator
    );
  } else {
    this.filteredQuestionBanks = [...this.questionBanks];
  }
}

//   copyMcq(mcq: any) {
//     console.log(mcq);
    
//   const question = mcq.questionText || '';
//   const code = mcq.codeSnippet || '';
//   const options = mcq.options?.map((opt: any, idx: number) => `Option ${idx + 1}: ${opt.text || ''}`).join('\n') || '';
//   const answer = mcq.answer?.args?.[0] || '';

//   const textToCopy = `Question:\n${question}\n\n${code}\n\n${options}\n\nCorrect Answer:\n${answer}`;

//   navigator.clipboard.writeText(textToCopy).then(() => {
//     // alert('✅ Copied to clipboard!');
//     console.log("✅ Copied to clipboard!");
    
//   }).catch(err => {
//     alert('❌ Failed to copy: ' + err);
//   });
// }

copyMcq(mcq: any, index: number, event: Event) {
  console.log(mcq);
  
    const button = event.target as HTMLButtonElement;
  const question = mcq.questionText || '';
  let code
  if(mcq.codeVisible == true){
    code = mcq.codeSnippet || '';
  } else 
    code = ''
  const options = mcq.options?.map((opt: any, idx: number) => `Option ${idx + 1}: ${opt.text || ''}`).join('\n') || '';
  const answer = mcq.answer?.args?.[0] || '';

  const textToCopy = `Question:\n${question}\n\n${code}\n\n${options}\n\nCorrect Answer:\n${answer}`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    this.copiedIndex = index;
    button.blur();
    setTimeout(() => {
      this.copiedIndex = null;
    }, 3000);
  }).catch(err => {
    alert('❌ Failed to copy: ' + err);
  });
}



  customSearchFn = (term: string, item: any) => {
  const lowerTerm = term.toLowerCase();
  return (
    item.name.toLowerCase().includes(lowerTerm) ||
    item.topic.name.toLowerCase().includes(lowerTerm) ||
    item.topic.subject.name.toLowerCase().includes(lowerTerm) 
  );
};

  onSubtopicChangeById(event: Event) {
    console.log(event);
    
  //   const selectElement = event.target as HTMLSelectElement;
  // const selectedSubtopicId = selectElement.value;
  // console.log('subtopic changed', selectedSubtopicId);
  
  const selected = this.subtopics.find(
    (s) => s.sub_topic_id === event
  );

  if (selected) {
    this.mcqForm.patchValue({
      sub_topic_id: selected.sub_topic_id,
      topic_id: selected.topic.topic_id,
      subject_id: selected.topic.subject.subject_id,
      topic_name: selected.topic.name,
      subject_name: selected.topic.subject.name,
    });
  }
}


  onSubtopicChange(event: Event) {
  const selectElement = event.target as HTMLSelectElement;
  const selectedSubtopicId = selectElement.value;

  const selected = this.subtopics.find(
    (s) => s.sub_topic_id === selectedSubtopicId
  );

  if (selected) {
    this.mcqForm.patchValue({
      topic_name: selected.topic.name,
      subject_name: selected.topic.subject.name,
    });
  }
}


  generateFromPrompt() {
    this.loading = true;
    this.error = '';
    // const payload = { prompt: this.customPrompt };
    const payload = this.promptForm.value;
    console.log(payload);

        this.selectedQbId = '';

    const qbPayload = {
      search: this.promptForm.value.searchText,
      authToken: this.promptForm.value.token,
    };

    this.mcqService.getQuestionBanks(qbPayload).subscribe({
    next: (res: any) => {
      this.questionBanks = res.results.questionbanks || [];
      this.filteredQuestionBanks = [...this.questionBanks]; // initially no filter
      this.extractUniqueCreators();
    },
    error: (err) => {
      console.error('Error fetching QBs:', err);
    }
  });
    

    this.mcqService.generateMcqs(payload).subscribe({
      // next: (res: any) => {
      //   this.mcqs = res.response;
      //   this.loading = false;
      // },
      // error: (err) => {
      //   this.error = 'Something went wrong';
      //   this.loading = false;
      // },
      next: (res: any) => {
      this.mcqs = res.response.map((mcq: any) => ({
        ...mcq,
        questionText: this.getQuestionText(mcq.question_data),
        codeSnippet: this.getCodeSnippet(mcq.question_data),
        codeVisible: !!this.getCodeSnippet(mcq.question_data), // default visibility
        codeOutput: '', // Initialize code output
        outputerror: '', // Initialize output error
        verify: false, // Initialize verify flag
        upload: false, // Initialize upload flag

      }));
      console.log(this.mcqs);
      
      this.loading = false;
    }
    });
    // call the getTopics() method to fetch topics
    this.mcqService.getTopics(this.mcqForm.value.token || this.promptForm.value.token).subscribe({
      next: (res: any) => {
        console.log(res);
        this.subtopics = res.data;

      if (this.subtopics.length > 0) {
        const first = this.subtopics[0];
        this.mcqForm.patchValue({
          sub_topic_id: first.sub_topic_id,
          topic_id: first.topic.topic_id,
          subject_id: first.topic.subject.subject_id,
          topic_name: first.topic.name,
          subject_name: first.topic.subject.name,

        });
      }
      console.log(this.mcqForm.value);
      
      },
      error: (err) => {
        this.error = 'Something went wrong';
        this.loading = false;
      },
    });
  }

  verifySplitQuestion(mcq: any) {
    mcq.verify = true;
    if(mcq.codeVisible) {    
      // include codeOutput in this
      mcq.codeOutput = mcq.codeOutput || '';  
      mcq.question_data = this.combineQuestionAndCode(mcq.questionText, mcq.codeSnippet, mcq.codeVisible);
      mcq.code_snippet = mcq.codeSnippet
      mcq.questionText = mcq.questionText


      this.verifyQuestion(mcq);
    } else {
      mcq.question_data = mcq.questionText;
      mcq.code_snippet = '';
      this.verifyQuestion(mcq);
    }
  }

  uploadSplitQuestion(mcq: any) {
    
    // if(!mcq.token){
    //   alert('❌ Please enter a token to upload the question.');
    //   return;
    // }
    // this.uploading = true;
    mcq.question_data = this.combineQuestionAndCode(mcq.questionText, mcq.codeSnippet, mcq.codeVisible);
    this.uploadQuestion(mcq);
  }


  verifyQuestion(mcq: any) {
    // Simple check for one correct answer and valid format
    console.log(mcq);
    
    const isValid =
      mcq.question_data &&
      mcq.options.length === 4 &&
      mcq.answer.args.length === 1 &&
      mcq.options.some((opt: { text: any; }) => opt.text === mcq.answer.args[0]);
      // check whether the codeoutput & answer were equal
      if(mcq.codeOutput != ''){
      if(mcq.code_snippet && mcq.code_snippet.trim() !== '') {
        if(mcq.codeOutput && mcq.codeOutput.trim() !== '' ) {
          if(mcq.codeOutput.trim() !== mcq.answer.args[0].trim()) {
            mcq.verify = false;
            alert('❌ Code output does not match the answer.');
            return;
          }
        } else {
          mcq.verify = false;
          alert('❌ Code output is empty.');
          return;
        }
      }
    }

    // check there is no duplicate options
    const optionsSet = new Set(mcq.options.map((opt: { text: any; }) => opt.text));
    if (optionsSet.size !== mcq.options.length) {
      mcq.verify = false;
      alert('❌ Duplicate options found.');
      return;
    }

  
    if (isValid) {
      const payload = {
        question: mcq.question_data,
        code_snippet: mcq.code_snippet || '',
        questionText: mcq.questionText || '',
        options: mcq.options.map((opt: { text: any; }) => opt.text),
        answer: mcq.answer.args[0],
      };
      console.log(payload);
        
      this.mcqService.verifyMcqs(payload).subscribe({
        next: (res: any) => {
          console.log(res);
          // check by converting to lowercase
          if(res.response.toLowerCase() === 'correct') 
          {
            mcq.verify = false;
            alert('✅ Question verified successfully.\n✅ 4 options found.\n✅ 1 correct answer found.\n✅ No duplicate options found.');
          } else {
            mcq.verify = false;
            alert('❌ Verification failed.\n' + res.response);
          }
        },
        error: (err) => {
          mcq.verify = false;
          alert('❌ Verification failed.');
        },
      });
    } else {
      mcq.verify = false;
      alert('❌ Invalid question format or missing data.');
    }
  }

  uploadQuestion(mcq: any) {
    // if(this.selectedQbId == ''){
    //   alert('❌ QB is not selected')
    //   return;
    // }
    console.log(mcq);
    console.log(this.mcqForm.value);
    console.log(this.promptForm.value);
    
    
    if(!this.mcqForm.value.token && !this.promptForm.value.token) {
      alert('❌ Please enter a token to upload the question.');
      return;
    }
    // set difficulty level to easy
    mcq.difficulty_level = mcq.difficulty_level || mcq.difficulty || 'Easy';
    
    mcq.upload = true;
    this.error = '';

    const payload = {
      token: this.mcqForm.value.token || this.promptForm.value.token, // Token for authentication
      topic_id: this.mcqForm.value.topic_id || '', // Topic for the question
      sub_topic_id: this.mcqForm.value.sub_topic_id || '', // Sub-topic ID
      subject_id: this.mcqForm.value.subject_id || '', // Subject ID
      response: [mcq],
      // qb_id: this.mcqForm.value.qb_id || this.promptForm.value.qb_id || '', // Question bank ID
      qb_id: this.selectedQbId || this.mcqForm.value.qb_id || this.promptForm.value.qb_id || '', // Question bank ID
      createdBy: this.mcqForm.value.createdBy || '', // Creator's name or ID
    };

    console.log(payload);
    
  
    this.mcqService.uploadMcqs(payload).subscribe({
      next: (res: any) => {
        if(res.response[0].status == 'Failed') {
          mcq.upload = false;
        alert('Question uploading failed.');

        } else {
        mcq.upload = true;
        alert('✅ Question uploaded successfully.');
        }
      },
      error: (err) => {
        mcq.upload = false;
        this.error = 'Something went wrong';
      },
    });
  }

  uploadAllQuestion(mcq: any) {
    // if(this.selectedQbId == ''){
    //   alert('❌ QB is not selected')
    //   return;
    // }
    console.log(this.promptForm);
    console.log(this.mcqForm);
    
    if(this.mcqForm.value.token == "" && this.promptForm.value.token == "") {
      alert('❌ Please enter a token to upload the questions.');
      return;
    }
    // set all the mcq.question_data to the combined question and code snippet
    this.mcqs.forEach((item) => {
      item.question_data = this.combineQuestionAndCode(item.questionText, item.codeSnippet, item.codeVisible);
      item.code_snippet = item.codeSnippet;
      item.questionText = item.questionText;
      item.difficulty_level = item.difficulty_level || item.difficulty || 'Easy';
      // item.topic_id = this.mcqForm.value.topic_id || '', // Topic for the question
      // item.sub_topic_id= this.mcqForm.value.sub_topic_id || '', // Sub-topic ID
      // item.subject_id= this.mcqForm.value.subject_id || '' // Subject ID
    });
// if any mcq.upload is true, then dont upload that question
    const mcqsToUpload = this.mcqs.filter(item => !item.upload);
    if(mcqsToUpload.length === 0) {
      alert('❌ All questions are already uploaded.');
      return;
    }
    



    this.uploading = true;
    this.error = '';
    console.log(mcqsToUpload);
    
    // this.loading = true;
    this.error = '';
    

    const payload = {
      token: this.mcqForm.value.token || this.promptForm.value.token,
      response: mcqsToUpload,
      // qb_id: this.mcqForm.value.qb_id || '', // Question bank ID
      qb_id: this.selectedQbId || this.mcqForm.value.qb_id || this.promptForm.value.qb_id || '', // Question bank ID
      createdBy: this.mcqForm.value.createdBy || '', // Creator's name or ID
      topic_id: this.mcqForm.value.topic_id || '', // Topic for the question
      sub_topic_id: this.mcqForm.value.sub_topic_id || '', // Sub-topic ID
      subject_id: this.mcqForm.value.subject_id || '', // Subject ID
    };

    console.log(payload);
    
  
    this.mcqService.uploadMcqs(payload).subscribe({
      next: (res: any) => {
        alert('✅ Question uploaded successfully.');
        this.uploading = false;
        this.mcqs.forEach((item) => {
          item.upload = true; // Mark all questions as uploaded
          });
        },
      error: (err) => {
        this.error = 'Something went wrong';
        this.uploading = false;
      },
    });
  }

  runCode(code: string, index: number, mcq: any): void {
    mcq.runcode = true;
    // This method can be used to run the code snippet if needed

    // For now, we will just log the code to the console
    if(!this.language){
      mcq.runcode = false;
      alert('❌ Please select a language.');
      return;
    }
    const payload = {
      code_snippet: code,
      language: this.language
      };
    this.mcqService.runCode(payload).subscribe({
      next: (res: any) => {
        console.log('Code executed successfully:', res);
        
        if(res.response.result || res.response.code_snippet) {
          this.mcqs[index].codeOutput = res.response.result || 'No output returned';
          this.mcqs[index].codeSnippet = res.response.code_snippet || '';
          this.mcqs[index].outputerror = '';
        }

        if(!res.response.result || !res.response.code_snippet) {
          this.mcqs[index].outputerror = res.response || 'No output returned';
          this.mcqs[index].codeOutput = '';
        }
        mcq.runcode = false;
        // alert('✅ Code executed successfully.');
      },
      error: (err) => {
        mcq.runcode = false;
        console.error('Error executing code:', err);
        alert('❌ Error executing code.');
      },
    });
  }
}


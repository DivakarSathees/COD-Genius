import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';

@Injectable({ providedIn: 'root' })
export class CodServiceService {
  // private apiUrl = 'http://localhost:3000';
  private apiUrl = 'https://cod-genius-backend.onrender.com';
  

  constructor(private http: HttpClient) {}

  generateCods(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/generate-cod-description`, data);
  }

  generateBatch(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/generate-batch`, data);
  }

  getModels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/models`);
  }

  getAllSessions(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sessions`);
  }

  getConversationsById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/conversations/${id}`);
  }

  getQuestionBanks(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/fetch-qbs`, data);
  }

  getTopics(token: string): Observable<any> {
    return this.http.get(`https://api.examly.io/api/getalldetails`, {
      headers: { 'Authorization': `${token}` }
    });
  }

  generateSolution(cod: any, autoValidate = false): Observable<any> {
    return this.http.post(`${this.apiUrl}/generate-solution`, { ...cod, autoValidate });
  }

  regenerateTestcases(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/regenerate-testcases`, data);
  }

  refineCod(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/refine-cod`, data);
  }

  getGuidelines(): Observable<any> {
    return this.http.get(`${this.apiUrl}/guidelines`);
  }

  getTokenUsage(): Observable<any> {
    return this.http.get(`${this.apiUrl}/token-usage`);
  }

  runCode(code: any): Observable<any> {
    if (code.language === 'Python') return this.http.post(`${this.apiUrl}/run-python`, code);
    if (code.language === 'C#' || code.language === 'csharp') return this.http.post(`${this.apiUrl}/run-csharp`, code);
    if (code.language === 'C') return this.http.post(`${this.apiUrl}/run-c`, code);
    if (code.language === 'C++' || code.language === 'cpp') return this.http.post(`${this.apiUrl}/run-cpp`, code);
    return this.http.post(`${this.apiUrl}/run-java`, code);
  }

  uploadCods(data: any, token: any): Observable<any> {
    const decode = this.decodeToken(token);
    data.createdBy = decode?.user_id || '';
    return this.http.post(`${this.apiUrl}/upload-to-platform`, { data, token });
  }

  decodeToken(token: string): any {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  }
}

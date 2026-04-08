import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class McqServiceService {

  // private apiUrl = 'http://localhost:3000'; // adjust as needed
  private apiUrl = 'https://cod-genius-backend.onrender.com';

  // private apiUrl = 'https://mcq-generator-pixe.onrender.com'; // adjust as needed
  // private apiUrl1 = 'https://metadata-mapping-backend.onrender.com';


  constructor(private http: HttpClient) {}

  generateMcqs(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/generate-mcq`, data);
  }

  verifyMcqs(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-mcq`, data);
  }

  uploadMcqs(data: any): Observable<any> {
    const decode = this.decodeToken(data.token);
    console.log('Decoded Token:', decode.user_id);
    data.createdBy = decode.user_id; // Add user_id to the data object

    return this.http.post(`${this.apiUrl}/upload-to-platform`, data);
  }

  runCode(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/run-code`, data);
  }

  // impl getTopics() method to fetch topics with passing the the token as a header
  getTopics(token: string): Observable<any> {
    return this.http.get(`https://api.examly.io/api/getalldetails`, {
      headers: {
        'Authorization': `${token}`
      }
    });

  }

  getQuestionBanks(data: any) {
    return this.http.post(`${this.apiUrl}/fetch-qbs`, data);
  }

  // token decoder method
  decodeToken(token: string): any {
    try {
      const payload = token.split('.')[1];
      console.log(JSON.parse(atob(payload)));
      
      return JSON.parse(atob(payload));
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }
}

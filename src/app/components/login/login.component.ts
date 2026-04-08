import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  form: FormGroup;
  loading = false;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router, private toastr: ToastrService) {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
    if (this.auth.isLoggedIn()) this.router.navigate(['/']);
  }

  submit() {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    const { username, password } = this.form.value;
    this.auth.login(username, password).subscribe({
      next: () => {
        this.toastr.success('Welcome back!', 'Signed in');
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.toastr.error(err.error?.error || 'Login failed. Please try again.', 'Auth Error');
        this.loading = false;
      }
    });
  }
}

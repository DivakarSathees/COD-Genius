import { Routes } from '@angular/router';
import { CodGeneratorComponent } from './components/cod-generator/cod-generator.component';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: CodGeneratorComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];

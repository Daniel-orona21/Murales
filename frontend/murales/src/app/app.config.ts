import { ApplicationConfig, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideFirebaseApp, initializeApp, FirebaseAppModule } from '@angular/fire/app';
import { provideAuth, getAuth, AuthModule } from '@angular/fire/auth';
import { provideAnalytics, getAnalytics, AnalyticsModule } from '@angular/fire/analytics';
import { environment } from '../environments/environment';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom([
      provideFirebaseApp(() => initializeApp(environment.firebase)),
      provideAuth(() => getAuth()),
      provideAnalytics(() => getAnalytics())
    ])
  ]
};

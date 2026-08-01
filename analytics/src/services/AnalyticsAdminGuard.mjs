export class AnalyticsAdminGuard {
  constructor({ authClient, dashboardClient, loginUrl = '/login' }) {
    this.authClient = authClient;
    this.dashboardClient = dashboardClient;
    this.loginUrl = loginUrl;
  }

  async authorize() {
    const { data: { user } = {}, error: authError } = await this.authClient.auth.getUser();
    if (authError) return { authorized: false, reason: 'unauthenticated', redirectTo: this.loginUrl };
    if (!user) return { authorized: false, reason: 'unauthenticated', redirectTo: this.loginUrl };
    const { data, error } = await this.dashboardClient.schema('analytics').rpc('is_analytics_admin');
    return !error && data === true
      ? { authorized: true, user }
      : { authorized: false, reason: 'forbidden' };
  }
}

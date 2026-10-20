# Attendance-System

## Deploying

Push changes to `main` to publish the static site with GitHub Pages. The Best Attenders page works with the existing Apps Script deployment by loading the dates and reports. To enable its faster single-request API, deploy the updated `code.gs` to the existing Google Apps Script web app: in Apps Script, open **Deploy > Manage deployments**, edit the current deployment, select **New version**, and deploy it. Keep the deployment URL in `index.html` pointed at that web app.
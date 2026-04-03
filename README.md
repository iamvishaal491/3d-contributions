# Interactive 3D GitHub Contribution Visualizer

A stunning 3D visualization of your GitHub contributions, rendered using Three.js and powered by the GitHub GraphQL API. Built with Vite and deeply compatible with Vercel deployment constraints.

## Features
- **True 3D Representation:** Contributions turned into beautiful stylized 3D cubes.
- **Glassmorphism UI:** Clean dark mode UI overlays.
- **Interactive:** Draggable camera (OrbitControls), interactive tooltips to view each day's exact contribution count.
- **Secure Backend:** Implements a Vercel Serverless function to proxy requests, securely keeping your Personal Access Token away from the client browser.

## Running Locally

To run this application locally, you will need a GitHub Personal Access Token (PAT). 
You only need `read:user` permissions.

1. **Install Vercel CLI**
   We use `vercel dev` so that our `/api` Serverless Functions work in tandem with the Vite frontend.
   ```bash
   npm install -g vercel
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set Environment Variables**
   Create a `.env` file in the root directory:
   ```bash
   GITHUB_TOKEN=your_personal_access_token_here
   ```

4. **Launch Dev Server**
   ```bash
   vercel dev
   ```

## Deploying to Vercel

1. Create a GitHub repository and push your code.
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New Project**.
3. Import your GitHub repository.
4. **Environment Variables:** In the Vercel project configuration, add your token:
   - Name: `GITHUB_TOKEN`
   - Value: `ghp_xxxxxx...`
5. Click **Deploy**. Vercel will automatically detect the Vite setup and build the frontend, and it will deploy `/api/contributions.js` as an edge function.

## Embedding in GitHub Profile README

Once deployed, you can add a link to this visualizer in your GitHub Profile (`username/username`) repository's `README.md`.

```markdown
## 📫 Check out my 3D Contributions
[![View 3D Contributions](https://img.shields.io/badge/View_3D-GitHub_Contributions-4ade80?style=for-the-badge&logo=threedotjs&logoColor=white)](https://your-vercel-deployment-url.vercel.app/)
```

### Note on Previews
Because this application relies on WebGL (Three.js), it requires an interactive browser session and cannot be embedded purely as an image in Markdown without an iframe (which GitHub does not allow). Thus, using a polished link button is the best method to drive traffic.

---

<table>
  <tr>
    <td width="60%" valign="top">
      <div align="center">
        <a href="https://3d-contributions-app.vercel.app/?username=iamvishaal491">
          <img src="https://raw.githubusercontent.com/iamvishaal491/3d-contributions-app/main/output/isometric-calendar.svg" alt="3D Isometric Contribution Calendar" width="100%" />
        </a>
      </div>
    </td>
    <td width="40%" valign="top">
      <h3>💻 Tech Stack</h3>
      <p><b>🧠 AI / Data / ML</b><br/>
      <img src="https://img.shields.io/badge/python-3670A0?style=flat&logo=python&logoColor=ffdd54" alt="Python"/>
      <img src="https://img.shields.io/badge/numpy-%23013243?style=flat&logo=numpy&logoColor=white" alt="NumPy"/>
      <img src="https://img.shields.io/badge/pandas-%23150458?style=flat&logo=pandas&logoColor=white" alt="Pandas"/>
      <img src="https://img.shields.io/badge/TensorFlow-%23FF6F00?style=flat&logo=TensorFlow&logoColor=white" alt="TensorFlow"/>
      <img src="https://img.shields.io/badge/PyTorch-%23EE4C2C?style=flat&logo=PyTorch&logoColor=white" alt="PyTorch"/>
      <img src="https://img.shields.io/badge/scikit--learn-%23F7931E?style=flat&logo=scikit-learn&logoColor=white" alt="scikit-learn"/>
      <img src="https://img.shields.io/badge/opencv-%23white?style=flat&logo=opencv&logoColor=white" alt="OpenCV"/>
      </p>
      
      <p><b>⚙️ Backend / Tools</b><br/>
      <img src="https://img.shields.io/badge/node.js-6DA55F?style=flat&logo=node.js&logoColor=white" alt="NodeJS"/>
      <img src="https://img.shields.io/badge/flask-%23000?style=flat&logo=flask&logoColor=white" alt="Flask"/>
      <img src="https://img.shields.io/badge/mysql-%234479A1?style=flat&logo=mysql&logoColor=white" alt="MySQL"/>
      <img src="https://img.shields.io/badge/MongoDB-%234ea94b?style=flat&logo=mongodb&logoColor=white" alt="MongoDB"/>
      </p>

      <p><b>🧰 Dev & Cloud</b><br/>
      <img src="https://img.shields.io/badge/git-%23F05033?style=flat&logo=git&logoColor=white" alt="Git"/>
      <img src="https://img.shields.io/badge/github-%23121011?style=flat&logo=github&logoColor=white" alt="GitHub"/>
      <img src="https://img.shields.io/badge/github%20actions-%232671E5?style=flat&logo=githubactions&logoColor=white" alt="GitHub Actions"/>
      <img src="https://img.shields.io/badge/vercel-%23000000?style=flat&logo=vercel&logoColor=white" alt="Vercel"/>
      <img src="https://img.shields.io/badge/GoogleCloud-%234285F4?style=flat&logo=google-cloud&logoColor=white" alt="Google Cloud"/>
      </p>
    </td>
  </tr>
</table>

---

## ⚙️ Automated SVG Setup

The `output/isometric-calendar.svg` is generated automatically via `scripts/generate-calendar.js`.

### One-time Setup — Add Repository Secret

1. Go to your repository on GitHub.
2. Navigate to **Settings → Secrets and variables → Actions → New repository secret**.
3. Add the following secret:
   - **Name:** `GH_TOKEN`
   - **Value:** A Personal Access Token (PAT) with the following scopes:
     - `read:user`
     - `repo`

> **Why `repo`?** The workflow needs write access to commit the generated SVG back to the repository.

### Running the Workflow

- **Automatic:** Runs every day at midnight UTC via cron schedule.
- **Manual:** Go to **Actions → Generate Isometric Calendar SVG → Run workflow**.

<div align="center">
  <h1>🧬 Deep Gene Research</h1>
  <p><strong>Advanced AI-Powered Gene Function Research Platform</strong></p>
  
  ![GitHub deployments](https://img.shields.io/github/deployments/Scilence2022/DeepGeneResearch/Production)
  ![GitHub Release](https://img.shields.io/github/v/release/Scilence2022/DeepGeneResearch)
[![License: MIT](https://img.shields.io/badge/License-MIT-default.svg)](https://opensource.org/licenses/MIT)

  [![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.0-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
  [![shadcn/ui](https://img.shields.io/badge/shadcn/ui-1.0-000000?style=flat&logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
  
  [![Vercel](https://img.shields.io/badge/Deploy%20on%20Vercel-000000?style=flat&logo=vercel&logoColor=white)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FScilence2022%2FDeepGeneResearch&project-name=DeepGeneResearch&repository-name=DeepGeneResearch)
  [![Cloudflare](https://img.shields.io/badge/Deploy%20on%20Cloudflare-F38020?style=flat&logo=cloudflare&logoColor=white)](./docs/How-to-deploy-to-Cloudflare-Pages.md)
  [![PWA](https://img.shields.io/badge/PWA-Enabled-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://research.u14.app/)
  
  [![Live Demo](https://img.shields.io/badge/Live%20Demo-Available-00D4AA?style=flat&logo=vercel&logoColor=white)](https://deep-gene-research.vercel.app/)
  [![Documentation](https://img.shields.io/badge/Documentation-Complete-4CAF50?style=flat&logo=gitbook&logoColor=white)](./docs/)
</div>

---

## 🎯 **Revolutionizing Gene Research with AI**

**Deep Gene Research** is a cutting-edge, AI-powered platform specifically designed for comprehensive gene function analysis and molecular biology research. Built by **Genome AI Studio**, this platform combines advanced artificial intelligence with specialized biological databases to deliver rapid, accurate, and comprehensive gene research reports in minutes rather than days.

### **Why Deep Gene Research?**

Traditional gene research requires extensive manual literature review, database searches, and data integration across multiple platforms. Our platform automates this complex process, providing:

- **⚡ 10x Faster Research**: Generate comprehensive gene reports in 2-3 minutes
- **🎯 Specialized Focus**: Purpose-built for gene function research, not generic AI
- **🔬 Scientific Accuracy**: Leverages curated biological databases and AI models
- **🔒 Privacy-First**: All data processed locally, ensuring complete privacy
- **🌐 Multi-Organism Support**: From E. coli to human genes
- **📊 Interactive Visualizations**: Knowledge graphs and pathway diagrams

## ✨ **Core Features**

### 🧬 **Advanced Gene Research Capabilities**

- **Multi-Focus Research**: Select from 7 specialized research focuses:
  - General Gene Function
  - Disease Association
  - Protein Structure
  - Expression Analysis
  - Protein Interactions
  - Evolutionary Analysis
  - Therapeutic Potential

- **Comprehensive Analysis**: 
  - Molecular function analysis
  - Protein structure prediction
  - Expression pattern analysis
  - Protein-protein interaction networks
  - Disease association mapping
  - Evolutionary conservation analysis

### 🤖 **AI-Powered Intelligence**

- **Multi-LLM Support**: Integration with 15+ leading AI models
  - Google Gemini (including Gemini 2.0 Flash Thinking)
  - OpenAI GPT-4, GPT-4o, GPT-3.5
  - Anthropic Claude 3.5 Sonnet
  - DeepSeek, Mistral, xAI Grok
  - Azure OpenAI, OpenRouter
  - Ollama (local models)
  - And more...

- **Specialized Search Integration**:
  - PubMed, UniProt, NCBI Gene
  - GEO, PDB, KEGG, STRING
  - OMIM, Ensembl, Reactome
  - Tavily, Firecrawl, Exa, Bocha

### 🔬 **Research Tools & Features**

- **Local Knowledge Base**: Upload and process research files
  - PDF documents
  - Office files (Word, Excel, PowerPoint)
  - Text files
  - Web content via crawler

- **Interactive Research Interface**:
  - Real-time research progress tracking
  - Editable research reports (WYSIWYG & Markdown)
  - Knowledge graph generation
  - Research history management

- **Advanced Visualization**:
  - Protein structure diagrams
  - Pathway maps
  - Interaction networks
  - Expression heatmaps

### 🛡️ **Privacy & Security**

- **Local Processing**: All data processed in your browser
- **No Data Collection**: We don't store your research data
- **Secure API Calls**: Optional server-side processing with encryption
- **Multi-Key Support**: Load balancing across multiple API keys

## 🎯 Roadmap

- [x] Support preservation of research history
- [x] Support editing final report and search results
- [x] Support for other LLM models
- [x] Support file upload and local knowledge base
- [x] Support SSE API and MCP server

## 🚀 **Quick Start**

### **Option 1: One-Click Deployment (Recommended)**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FScilence2022%2FDeepGeneResearch&project-name=DeepGeneResearch&repository-name=DeepGeneResearch)

1. **Get API Keys**: Obtain keys from your preferred AI provider
   - [Google AI Studio](https://aistudio.google.com/app/apikey) (Free tier available)
   - [OpenAI](https://platform.openai.com/api-keys)
   - [Anthropic](https://console.anthropic.com/)

2. **Deploy**: Click the Vercel button above
3. **Configure**: Add your API keys in the environment variables
4. **Start Researching**: Begin your gene research immediately!

### **Option 2: Local Development**

```bash
# Clone the repository
git clone https://github.com/Scilence2022/DeepGeneResearch.git
cd DeepGeneResearch

# Install dependencies
pnpm install

# Set up environment variables
cp env.tpl .env.local

# Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the application.

## 📋 **Prerequisites**

- **Node.js**: Version 18.18.0 or later
- **Package Manager**: pnpm (recommended), npm, or yarn
- **API Keys**: At least one AI provider API key
- **Browser**: Modern browser with JavaScript enabled

## ⚙️ **Configuration**

### **Environment Variables**

Create a `.env.local` file (for development) or `.env` file (for production) with your configuration:

```bash
# AI Provider Configuration
GOOGLE_API_KEY=your_google_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Search Provider Configuration
TAVILY_API_KEY=your_tavily_api_key
EXA_API_KEY=your_exa_api_key

# Optional: Access Control
ACCESS_PASSWORD=your_secure_password

# Optional: Custom Model Lists
NEXT_PUBLIC_MODEL_LIST=gemini-2.0-flash-thinking-exp,gemini-2.0-flash-exp,gpt-4o
```

### **Supported AI Providers**

| Provider | Models | Free Tier | Best For |
|----------|--------|-----------|----------|
| Google | Gemini 2.0 Flash, Gemini Pro | ✅ | General research, thinking tasks |
| OpenAI | GPT-4o, GPT-4, GPT-3.5 | ❌ | High-quality analysis |
| Anthropic | Claude 3.5 Sonnet | ❌ | Complex reasoning |
| DeepSeek | DeepSeek-V2, DeepSeek-Coder | ✅ | Cost-effective research |
| Mistral | Mistral Large, Mistral 7B | ❌ | European data compliance |
| xAI | Grok-2 | ❌ | Latest AI capabilities |

## 📊 **Research Workflow**

```mermaid
flowchart TB
    A[Gene Input] --> B[Research Focus Selection]
    B --> C[AI Analysis & Planning]
    C --> D[Database Queries]
    D --> E[Literature Search]
    E --> F[Data Integration]
    F --> G[Report Generation]
    G --> H[Knowledge Graph]
    H --> I[Final Report]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fff3e0
    style D fill:#e8f5e8
    style E fill:#fff8e1
    style F fill:#fce4ec
    style G fill:#e0f2f1
    style H fill:#f1f8e9
    style I fill:#e8eaf6
```

### **Research Process**

1. **Input**: Gene symbol, organism, research focus
2. **Analysis**: AI analyzes research requirements
3. **Planning**: Generates comprehensive research plan
4. **Search**: Queries biological databases and literature
5. **Integration**: Combines data from multiple sources
6. **Synthesis**: AI synthesizes findings into coherent report
7. **Visualization**: Generates knowledge graphs and diagrams
8. **Output**: Delivers comprehensive research report

## 🚢 **Deployment Options**

### **Vercel (Recommended)**
- One-click deployment
- Automatic HTTPS
- Global CDN
- Serverless functions

### **Cloudflare Pages**
- Edge computing
- Global distribution
- Cost-effective
- [Deployment Guide](./docs/How-to-deploy-to-Cloudflare-Pages.md)

### **Self-Hosted**
- Docker support
- Custom domains
- Full control
- Enterprise features

### **Static Export**
```bash
pnpm build:export
# Deploy the 'out' directory to any static hosting
```

## 🔧 **Advanced Features**

### **API Integration**

#### **Server-Sent Events (SSE) API**

Real-time gene research with streaming responses:

```typescript
// POST /api/sse
{
  "query": "TP53 gene function in cancer",
  "provider": "google",
  "thinkingModel": "gemini-2.0-flash-thinking-exp",
  "taskModel": "gemini-2.0-flash-exp",
  "searchProvider": "tavily",
  "language": "en",
  "maxResult": 10,
  "enableCitationImage": true,
  "enableReferences": true
}
```

#### **Model Context Protocol (MCP)**

Integrate with AI assistants:

```json
{
  "mcpServers": {
    "deep-gene-research": {
      "url": "https://your-domain.com/api/mcp",
      "transportType": "streamable-http",
      "timeout": 600,
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_PASSWORD"
      }
    }
  }
}
```

### **Custom Model Configuration**

Control which models are available:

```bash
# Enable specific models
NEXT_PUBLIC_MODEL_LIST=gemini-2.0-flash-thinking-exp,gemini-2.0-flash-exp

# Disable specific models
NEXT_PUBLIC_MODEL_LIST=-gpt-3.5-turbo,-claude-3-haiku

# Only allow specific models
NEXT_PUBLIC_MODEL_LIST=-all,+gemini-2.0-flash-thinking-exp,+gemini-2.0-flash-exp
```

## 🏗️ **Architecture & Technology Stack**

### **Frontend**
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: High-quality component library
- **Zustand**: State management
- **React Hook Form**: Form handling with validation

### **Backend**
- **Next.js API Routes**: Serverless functions
- **AI SDK**: Unified AI provider interface
- **Streaming**: Real-time response streaming
- **Caching**: Intelligent response caching

### **AI Integration**
- **Multi-Provider Support**: 15+ AI providers
- **Streaming Responses**: Real-time data flow
- **Error Handling**: Robust error recovery
- **Rate Limiting**: API usage optimization

### **Data Sources**
- **Biological Databases**: NCBI, UniProt, PDB, KEGG
- **Literature**: PubMed, Google Scholar
- **Web Search**: Tavily, Exa, Firecrawl
- **Local Knowledge**: File upload and processing

## 🌍 **Multi-Language Support**

- **English**: Complete feature set
- **中文 (Chinese)**: Full localization
- **Español (Spanish)**: Complete translation
- **Tiếng Việt (Vietnamese)**: Full support

## 🔒 **Privacy & Security**

### **Data Protection**
- **Local Processing**: All research data stays in your browser
- **No Tracking**: We don't collect usage analytics
- **Encrypted Storage**: Local data encrypted at rest
- **Secure APIs**: All external calls use HTTPS

### **Privacy Modes**
- **Local Mode**: Complete privacy, no external calls
- **Hybrid Mode**: Local processing with external search
- **Server Mode**: Full API integration with encryption

## 📈 **Performance & Scalability**

- **Response Time**: 2-3 minutes for comprehensive reports
- **Concurrent Users**: Supports multiple simultaneous research sessions
- **Caching**: Intelligent caching reduces API costs
- **Rate Limiting**: Prevents API abuse
- **Error Recovery**: Automatic retry mechanisms

## 🛠️ **Development**

### **Project Structure**
```
src/
├── app/                 # Next.js App Router
├── components/          # React components
│   ├── Research/       # Gene research components
│   ├── ui/            # UI components
│   └── Internal/      # Internal components
├── utils/              # Utility functions
│   ├── gene-research/ # Gene-specific utilities
│   └── deep-research/ # General research utilities
├── types/              # TypeScript definitions
├── constants/          # Application constants
└── locales/           # Internationalization
```

### **Key Technologies**
- **Next.js 15**: Latest React framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **shadcn/ui**: Components
- **Zustand**: State management
- **React Hook Form**: Forms
- **Zod**: Validation

## 🤝 **Contributing**

We welcome contributions! Here's how you can help:

### **Ways to Contribute**
- 🐛 **Bug Reports**: Found a bug? Let us know!
- 💡 **Feature Requests**: Have an idea? Share it!
- 🔧 **Code Contributions**: Submit pull requests
- 📚 **Documentation**: Help improve docs
- 🌍 **Translations**: Add new languages

### **Development Process**
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### **Code Standards**
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Conventional commits

## 📚 **Documentation**

- [API Documentation](./docs/deep-research-api-doc.md)
- [Deployment Guide](./docs/How-to-deploy-to-Cloudflare-Pages.md)
- [MCP Configuration](./mcp-client-config-examples.md)
- [Timeout Configuration](./TIMEOUT_CONFIGURATION_SUMMARY.md)

## 🆘 **Support & Community**

### **Getting Help**
- 📖 **Documentation**: Check our comprehensive docs
- 🐛 **Issues**: Report bugs on GitHub
- 💬 **Discussions**: Join community discussions
- 📧 **Contact**: Reach out via GitHub issues

### **Community**
- ⭐ **Star**: Show your support
- 🍴 **Fork**: Create your own version
- 👀 **Watch**: Stay updated
- 💬 **Discuss**: Join conversations

## 🙏 **Acknowledgments**

### **Open Source Projects**
- [Next.js](https://nextjs.org/) - The React framework
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful components
- [AI SDK](https://sdk.vercel.ai) - AI integration
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS

### **Biological Databases**
- [NCBI](https://www.ncbi.nlm.nih.gov/) - Gene and protein data
- [UniProt](https://www.uniprot.org/) - Protein information
- [PubMed](https://pubmed.ncbi.nlm.nih.gov/) - Scientific literature
- [KEGG](https://www.genome.jp/kegg/) - Pathway databases

### **Inspiration**
- [Deep Research](https://github.com/dzhng/deep-research) - Original concept
- [U14 Deep Research](https://github.com/u14app/deep-research) - MCP integration

## 📄 **License**

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.

**What this means:**
- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Private use allowed
- ❌ No warranty provided

## 🌟 **Star History**

[![Star History Chart](https://api.star-history.com/svg?repos=Scilence2022/DeepGeneResearch&type=Date)](https://www.star-history.com/#Scilence2022/DeepGeneResearch&Date)

---

<div align="center">
  <p><strong>Built with ❤️ by <a href="https://github.com/Scilence2022">Genome AI Studio Team</a></strong></p>
  <p>Empowering researchers with AI-driven gene function analysis</p>
</div>

# API-Watch Frontend 🎨

Modern React frontend for API-Watch - API Testing & Monitoring Toolkit.

## 🛠️ Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS
- **Zustand** - State management
- **React Router** - Routing
- **Axios** - HTTP client
- **Recharts** - Data visualization
- **Lucide React** - Icons

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/      # Reusable UI components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── Layout.tsx
│   ├── pages/           # Page components
│   │   ├── Dashboard.tsx
│   │   ├── SingleRequest.tsx
│   │   ├── TestSuites.tsx
│   │   ├── Analytics.tsx
│   │   ├── History.tsx
│   │   └── Settings.tsx
│   ├── store/           # Zustand stores
│   │   └── useAppStore.ts
│   ├── lib/             # Utilities & config
│   │   ├── api.ts
│   │   └── utils.ts
│   ├── types/           # TypeScript types
│   │   └── index.ts
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── public/              # Static assets
└── package.json
```

## ✨ Features

### Implemented
- ✅ **Modern UI** - Clean, responsive design with dark mode
- ✅ **Dashboard** - Real-time statistics and charts
- ✅ **Single Request** - Visual API request builder
- ✅ **Test Suites** - Manage and execute test suites
- ✅ **History** - View past test executions
- ✅ **Analytics** - Performance metrics and insights
- ✅ **Dark Mode** - Toggle with localStorage persistence

### Coming Soon
- 🔜 **Real-time Execution** - Live test progress with WebSockets
- 🔜 **Visual YAML Editor** - Drag-and-drop test suite builder
- 🔜 **Export Reports** - PDF, CSV, JSON exports
- 🔜 **Collaborative Features** - Share test suites
- 🔜 **Advanced Analytics** - ML-powered insights

## 🔧 Configuration

Create a `.env` file:

```env
VITE_API_URL=http://localhost:8000
```

## 🎨 Theming

The app supports light and dark modes. Theme can be toggled via the header.

Custom colors are defined in `tailwind.config.js`:
- Primary: Purple gradient
- Secondary: Blue gradient

## 📱 Responsive Design

The UI is fully responsive and works on:
- 📱 Mobile (320px+)
- 💻 Tablet (768px+)
- 🖥️ Desktop (1024px+)

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e
```

## 📝 License

MIT License - see LICENSE file for details.

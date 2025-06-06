import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Bell,
  Book,
  Code,
  Eye,
  FileText,
  Folder,
  GitBranch,
  GitFork,
  Play,
  Search,
  Shield,
  Star,
  Tag,
} from "lucide-react"
import Link from "next/link"

export default function Component() {
  const files = [
    { name: ".github/workflows", type: "folder", message: "Create blank.yml", time: "4 days ago" },
    { name: "Feed.js Post Text Image", type: "file", message: "Create Feed.js Post Text Image", time: "4 days ago" },
    { name: "Firebase rules", type: "file", message: "Create Firebase rules", time: "4 days ago" },
    { name: "Fortress app", type: "file", message: "Create Fortress app", time: "4 days ago" },
    {
      name: "Fortressapp Dev Ready Firebase.js",
      type: "file",
      message: "Create Fortressapp Dev Ready Firebase.js",
      time: "4 days ago",
    },
    { name: "production environment", type: "file", message: "Create production environment", time: "4 days ago" },
    { name: "storage rules", type: "file", message: "Create storage rules", time: "4 days ago" },
  ]

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-[#161b22] px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
              <div className="w-6 h-6 bg-black rounded-full"></div>
            </div>
            <nav className="flex items-center gap-6 text-sm">
              <span>Product</span>
              <span>Solutions</span>
              <span>Resources</span>
              <span>Open Source</span>
              <span>Enterprise</span>
              <span>Pricing</span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search or jump to..."
                className="bg-[#21262d] border border-gray-600 rounded-md pl-10 pr-4 py-1.5 text-sm w-80"
              />
            </div>
            <Button variant="outline" size="sm">
              Sign in
            </Button>
            <Button size="sm">Sign up</Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Repository Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Book className="w-4 h-4 text-gray-400" />
            <Link href="#" className="text-blue-400 hover:underline">
              aqsa326
            </Link>
            <span className="text-gray-400">/</span>
            <Link href="#" className="text-blue-400 hover:underline font-semibold">
              Fortress-app
            </Link>
            <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
              Public
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
              <Bell className="w-4 h-4 mr-1" />
              Notifications
            </Button>
            <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
              <GitFork className="w-4 h-4 mr-1" />
              Fork
              <Badge variant="secondary" className="ml-1 bg-gray-700">
                0
              </Badge>
            </Button>
            <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
              <Star className="w-4 h-4 mr-1" />
              Star
              <Badge variant="secondary" className="ml-1 bg-gray-700">
                1
              </Badge>
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-gray-700 mb-6">
          <nav className="flex gap-6">
            <Link href="#" className="flex items-center gap-2 pb-3 border-b-2 border-orange-500 text-white">
              <Code className="w-4 h-4" />
              Code
            </Link>
            <Link href="#" className="flex items-center gap-2 pb-3 text-gray-400 hover:text-white">
              <div className="w-4 h-4 rounded-full border border-gray-400"></div>
              Issues
            </Link>
            <Link href="#" className="flex items-center gap-2 pb-3 text-gray-400 hover:text-white">
              <GitBranch className="w-4 h-4" />
              Pull requests
            </Link>
            <Link href="#" className="flex items-center gap-2 pb-3 text-gray-400 hover:text-white">
              <Play className="w-4 h-4" />
              Actions
            </Link>
            <Link href="#" className="flex items-center gap-2 pb-3 text-gray-400 hover:text-white">
              <div className="w-4 h-4 border border-gray-400"></div>
              Projects
            </Link>
            <Link href="#" className="flex items-center gap-2 pb-3 text-gray-400 hover:text-white">
              <Shield className="w-4 h-4" />
              Security
            </Link>
            <Link href="#" className="flex items-center gap-2 pb-3 text-gray-400 hover:text-white">
              <div className="w-4 h-4 border border-gray-400"></div>
              Insights
            </Link>
          </nav>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Repository Controls */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
                  <GitBranch className="w-4 h-4 mr-1" />
                  main
                </Button>
                <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
                  <GitBranch className="w-4 h-4 mr-1" />
                  Branches
                </Button>
                <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
                  <Tag className="w-4 h-4 mr-1" />
                  Tags
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Go to file"
                    className="bg-[#21262d] border border-gray-600 rounded-md pl-10 pr-4 py-1.5 text-sm w-64"
                  />
                </div>
                <Button size="sm" className="bg-green-600 hover:bg-green-700">
                  <Code className="w-4 h-4 mr-1" />
                  Code
                </Button>
              </div>
            </div>

            {/* Latest Commit */}
            <div className="bg-[#21262d] border border-gray-700 rounded-t-md p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold">
                  A
                </div>
                <span className="text-sm">
                  <Link href="#" className="text-blue-400 hover:underline">
                    aqsa326
                  </Link>{" "}
                  Create blank.yml
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>afba32f</span>
                <span>•</span>
                <span>4 days ago</span>
                <span>•</span>
                <span>7 Commits</span>
              </div>
            </div>

            {/* File List */}
            <div className="bg-[#0d1117] border border-gray-700 border-t-0 rounded-b-md">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border-b border-gray-700 last:border-b-0 hover:bg-[#161b22]"
                >
                  <div className="flex items-center gap-3">
                    {file.type === "folder" ? (
                      <Folder className="w-4 h-4 text-blue-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-gray-400" />
                    )}
                    <Link href="#" className="text-blue-400 hover:underline">
                      {file.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span>{file.message}</span>
                    <span>{file.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* About */}
            <Card className="bg-[#161b22] border-gray-700">
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-white">About</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-400 italic">No description, website, or topics provided.</p>
                <Separator className="bg-gray-700" />
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="w-4 h-4 border border-gray-400 rounded"></div>
                    Activity
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Star className="w-4 h-4" />1 star
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Eye className="w-4 h-4" />1 watching
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <GitFork className="w-4 h-4" />0 forks
                  </div>
                </div>
                <Link href="#" className="text-blue-400 hover:underline text-sm">
                  Report repository
                </Link>
              </CardContent>
            </Card>

            {/* Releases */}
            <Card className="bg-[#161b22] border-gray-700">
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-white">Releases</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400">No releases published</p>
              </CardContent>
            </Card>

            {/* Packages */}
            <Card className="bg-[#161b22] border-gray-700">
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-white">Packages</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400">No packages published</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

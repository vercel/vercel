import React from "react"

export default class ErrorBoundary extends React.Component<{
  fallback: (error: any) => React.ReactNode
}> {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      error,
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.error)
    }
    return this.props.children
  }
}

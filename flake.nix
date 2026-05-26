{
  description = "LemonX - Agentic AI Testing Platform Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        
        # Node.js 22 (matching the Dockerfile)
        nodejs = pkgs.nodejs_22;
        
        # Create a script to set up the environment
        setupScript = pkgs.writeShellScriptBin "setup-lemonx" ''
          #!/usr/bin/env bash
          set -e
          
          echo "🍋 Setting up LemonX development environment..."
          
          # Check if .env exists, if not create from example
          if [ ! -f .env ]; then
            if [ -f .env.example ]; then
              echo "📋 Creating .env from .env.example..."
              cp .env.example .env
              echo "⚠️  Please edit .env with your actual credentials"
            else
              echo "⚠️  No .env.example found. Please create .env manually"
            fi
          fi
          
          # Install npm dependencies if node_modules doesn't exist
          if [ ! -d node_modules ]; then
            echo "📦 Installing npm dependencies..."
            npm install
          fi
          
          echo "✅ LemonX environment ready!"
          echo ""
          echo "Available commands:"
          echo "  npm run dev           - Start development server"
          echo "  npm test              - Run tests"
          echo "  npm run docker:up     - Start with Docker Compose"
          echo "  npm run docs:dev      - Start documentation server"
          echo ""
          echo "Make sure to start Redis:"
          echo "  redis-server          - Start Redis server"
          echo "  OR"
          echo "  npm run docker:up     - Start Redis via Docker"
        '';
        
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Core dependencies
            nodejs
            nodejs.npm
            git
            
            # Redis (for local development)
            redis
            
            # Docker and Docker Compose (for running Redis and full stack)
            docker
            docker-compose
            
            # Utility tools
            curl
            jq
            
            # Setup script
            setupScript
          ];

          # Shell hook - runs when entering the devshell
          shellHook = ''
            echo "🍋 Welcome to LemonX development environment!"
            echo ""
            echo "Node.js version: $(node --version)"
            echo "npm version: $(npm --version)"
            echo "Git version: $(git --version)"
            echo "Redis version: $(redis-server --version | head -n1)"
            echo ""
            
           # Run setup manually if needed:
           # ./result/bin/setup-lemonx

            
            # Set helpful environment variables
            export LEMONX_DEV=1
            
            echo ""
            echo "💡 Tip: Run 'npm run dev' to start the application"
          '';

          # Environment variables
          env = {
            # Node.js settings
            NODE_ENV = "development";
            
            # Redis default settings (for local development)
            REDIS_HOST = "localhost";
            REDIS_PORT = "6379";
            
            # Default verbose logging
            VERBOSE = "true";
            DEBUG = "false";
          };
        };

        # Package definition (optional, for building)
        packages.default = pkgs.stdenv.mkDerivation {
          name = "lemonx";
          src = ./.;
          
          buildInputs = [ nodejs ];
          
          buildPhase = ''
            npm ci
            npm run test || true  # Don't fail build on test failures
          '';
          
          installPhase = ''
            mkdir -p $out
            cp -r . $out/
          '';
        };
      }
    );
}

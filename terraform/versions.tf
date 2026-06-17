terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    # Configure via backend config or -backend-config flags:
    # bucket = "yt-player-terraform-state"
    # key    = "production/terraform.tfstate"
    # region = "us-east-1"
    # encrypt = true
    # dynamodb_table = "yt-player-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "yt-player"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "yt-player"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

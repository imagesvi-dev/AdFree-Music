FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["AdFree-Music.csproj", "./"]
RUN dotnet restore "AdFree-Music.csproj"

# Copy the rest of the source code
COPY . .

# Build and publish the application
RUN dotnet build "AdFree-Music.csproj" -c Release -o /app/build
RUN dotnet publish "AdFree-Music.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app

# Install python3 and ffmpeg. 
# Although yt-dlp_linux is mostly standalone, installing these ensures maximum compatibility and extraction capabilities.
RUN apt-get update && apt-get install -y python3 ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy the published output from the build stage
COPY --from=build /app/publish .

# Railway dynamically assigns the PORT environment variable.
# We configure ASP.NET Core to bind to this port (defaulting to 8080 if not set).
ENV ASPNETCORE_URLS=http://+:${PORT:-8080}

# Railway expects apps to listen on 0.0.0.0
ENTRYPOINT ["dotnet", "AdFree-Music.dll"]

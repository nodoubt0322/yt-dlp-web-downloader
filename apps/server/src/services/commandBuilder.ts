export type QualityPreset = "bestAvailable" | "bestUnder1080p" | "bestUnder720p" | "bestUnder480p";

export function buildAnalyzeArgs(url: string): string[] {
  return ["--dump-json", "--no-playlist", "--no-warnings", "--", url];
}

export interface BuildDownloadArgsOptions {
  url: string;
  homePath: string;
  tempPath: string;
  outputTemplate: string;
  qualityPreset?: QualityPreset;
}

export function buildDownloadArgs(options: BuildDownloadArgsOptions): string[] {
  const preset = options.qualityPreset ?? "bestUnder1080p";
  const formatSelector = formatSelectorForPreset(preset);
  const sort = sortForPreset(preset);

  return [
    "--no-playlist",
    "--newline",
    "--progress-template",
    "download:%(progress)j",
    "-f",
    formatSelector,
    "-S",
    sort,
    "--merge-output-format",
    "mp4",
    "--paths",
    `home:${options.homePath}`,
    "--paths",
    `temp:${options.tempPath}`,
    "-o",
    options.outputTemplate,
    "--",
    options.url
  ];
}

function formatSelectorForPreset(preset: QualityPreset) {
  switch (preset) {
    case "bestAvailable":
      return "bv*+ba/b";
    case "bestUnder720p":
      return "bv*[height<=720]+ba/b[height<=720]/b";
    case "bestUnder480p":
      return "bv*[height<=480]+ba/b[height<=480]/b";
    case "bestUnder1080p":
      return "bv*[height<=1080]+ba/b[height<=1080]/b";
  }
}

function sortForPreset(preset: QualityPreset) {
  switch (preset) {
    case "bestAvailable":
      return "res";
    case "bestUnder720p":
      return "res:720";
    case "bestUnder480p":
      return "res:480";
    case "bestUnder1080p":
      return "res:1080";
  }
}

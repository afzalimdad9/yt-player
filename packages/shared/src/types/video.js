/** Represents the overall processing state of a video */
export var VideoStatus;
(function (VideoStatus) {
    VideoStatus["PENDING"] = "PENDING";
    VideoStatus["DOWNLOADING"] = "DOWNLOADING";
    VideoStatus["DOWNLOADED"] = "DOWNLOADED";
    VideoStatus["PROCESSING"] = "PROCESSING";
    VideoStatus["READY"] = "READY";
    VideoStatus["FAILED"] = "FAILED";
})(VideoStatus || (VideoStatus = {}));
/** Available streaming qualities */
export var VideoQuality;
(function (VideoQuality) {
    VideoQuality["QUALITY_144P"] = "144p";
    VideoQuality["QUALITY_240P"] = "240p";
    VideoQuality["QUALITY_360P"] = "360p";
    VideoQuality["QUALITY_480P"] = "480p";
    VideoQuality["QUALITY_720P"] = "720p";
    VideoQuality["QUALITY_1080P"] = "1080p";
    VideoQuality["QUALITY_1440P"] = "1440p";
    VideoQuality["QUALITY_2160P"] = "2160p";
})(VideoQuality || (VideoQuality = {}));
/** Audio quality levels */
export var AudioQuality;
(function (AudioQuality) {
    AudioQuality["LOW"] = "low";
    AudioQuality["MEDIUM"] = "medium";
    AudioQuality["HIGH"] = "high";
})(AudioQuality || (AudioQuality = {}));
/** Codec support */
export var VideoCodec;
(function (VideoCodec) {
    VideoCodec["H264"] = "h264";
    VideoCodec["H265"] = "h265";
    VideoCodec["VP9"] = "vp9";
    VideoCodec["AV1"] = "av1";
})(VideoCodec || (VideoCodec = {}));
/** Audio codec */
export var AudioCodec;
(function (AudioCodec) {
    AudioCodec["AAC"] = "aac";
    AudioCodec["OPUS"] = "opus";
    AudioCodec["MP3"] = "mp3";
})(AudioCodec || (AudioCodec = {}));
/** Container format */
export var ContainerFormat;
(function (ContainerFormat) {
    ContainerFormat["MP4"] = "mp4";
    ContainerFormat["WEBM"] = "webm";
})(ContainerFormat || (ContainerFormat = {}));
/** Streaming protocol */
export var StreamingProtocol;
(function (StreamingProtocol) {
    StreamingProtocol["HLS"] = "hls";
    StreamingProtocol["DASH"] = "dash";
})(StreamingProtocol || (StreamingProtocol = {}));
/** Track types for VTT */
export var TrackType;
(function (TrackType) {
    TrackType["CAPTIONS"] = "captions";
    TrackType["SUBTITLES"] = "subtitles";
    TrackType["DESCRIPTIONS"] = "descriptions";
    TrackType["CHAPTERS"] = "chapters";
    TrackType["THUMBNAILS"] = "thumbnails";
})(TrackType || (TrackType = {}));
//# sourceMappingURL=video.js.map
/** Names for the queues used in the system */
export var QueueName;
(function (QueueName) {
    QueueName["VIDEO_INGEST"] = "video-ingest";
    QueueName["VIDEO_PROCESS"] = "video-process";
    QueueName["CAPTION_GENERATE"] = "caption-generate";
    QueueName["THUMBNAIL_GENERATE"] = "thumbnail-generate";
    QueueName["MANIFEST_GENERATE"] = "manifest-generate";
    QueueName["CLEANUP"] = "cleanup";
})(QueueName || (QueueName = {}));
/** Events emitted during pipeline processing */
export var PipelineEvent;
(function (PipelineEvent) {
    PipelineEvent["DOWNLOAD_STARTED"] = "download:started";
    PipelineEvent["DOWNLOAD_COMPLETE"] = "download:complete";
    PipelineEvent["DOWNLOAD_FAILED"] = "download:failed";
    PipelineEvent["TRANSCODE_STARTED"] = "transcode:started";
    PipelineEvent["TRANSCODE_PROGRESS"] = "transcode:progress";
    PipelineEvent["TRANSCODE_COMPLETE"] = "transcode:complete";
    PipelineEvent["TRANSCODE_FAILED"] = "transcode:failed";
    PipelineEvent["CAPTION_STARTED"] = "caption:started";
    PipelineEvent["CAPTION_COMPLETE"] = "caption:complete";
    PipelineEvent["CAPTION_FAILED"] = "caption:failed";
    PipelineEvent["CHAPTER_DETECTED"] = "chapter:detected";
    PipelineEvent["THUMBNAIL_STARTED"] = "thumbnail:started";
    PipelineEvent["THUMBNAIL_COMPLETE"] = "thumbnail:complete";
    PipelineEvent["MANIFEST_GENERATED"] = "manifest:generated";
    PipelineEvent["PIPELINE_COMPLETE"] = "pipeline:complete";
    PipelineEvent["PIPELINE_FAILED"] = "pipeline:failed";
})(PipelineEvent || (PipelineEvent = {}));
//# sourceMappingURL=job.js.map
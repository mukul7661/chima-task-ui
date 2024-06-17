"use client";

import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import { useEffect, useState } from "react";
import { Slider, Spin, Button, message, Progress, Select } from "antd";
import { VideoPlayer } from "./VideoPlayer";
import { sliderValueToVideoTime } from "../utils/utils";
import VideoUpload from "./VideoUpload";
import axios from "axios";
const ffmpeg = createFFmpeg({ log: true });

const { Option } = Select;

function VideoEditor() {
  const [ffmpegLoaded, setFFmpegLoaded] = useState(false);
  const [videoFile, setVideoFile] = useState();
  const [videoPlayerState, setVideoPlayerState] = useState();
  const [videoPlayer, setVideoPlayer] = useState();
  const [sliderValues, setSliderValues] = useState([0, 100]);
  const [processing, setProcessing] = useState(false);
  const [editedVideoId, setEditedVideoId] = useState();
  const [isBackgroundRemoved, setIsBackgroundRemoved] = useState(false);
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [editedVideoUrl, setEditedVideoUrl] = useState();
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [intervalId, setIntervalId] = useState(null);

  useEffect(() => {
    // loading ffmpeg on startup
    ffmpeg.load().then(() => {
      setFFmpegLoaded(true);
    });
  }, []);

  useEffect(() => {
    const min = sliderValues[0];
    // when the slider values are updated, updating the
    // video time
    if (min !== undefined && videoPlayerState && videoPlayer) {
      videoPlayer.seek(sliderValueToVideoTime(videoPlayerState.duration, min));
    }
  }, [sliderValues]);

  useEffect(() => {
    if (videoPlayer && videoPlayerState) {
      // allowing users to watch only the portion of
      // the video selected by the slider
      const [min, max] = sliderValues;

      const minTime = sliderValueToVideoTime(videoPlayerState.duration, min);
      const maxTime = sliderValueToVideoTime(videoPlayerState.duration, max);

      if (videoPlayerState.currentTime < minTime) {
        videoPlayer.seek(minTime);
      }
      if (videoPlayerState.currentTime > maxTime) {
        // looping logic
        videoPlayer.seek(minTime);
      }
    }
  }, [videoPlayerState]);

  useEffect(() => {
    // when the current videoFile is removed,
    // restoring the default state
    if (!videoFile) {
      setVideoPlayerState(undefined);
      setSliderValues([0, 100]);
      setVideoPlayerState(undefined);
    }
  }, [videoFile]);

  function formatTime(seconds) {
    // Calculate minutes and remaining seconds
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    // Format minutes and seconds to always have two digits
    const formattedMinutes = String(minutes).padStart(2, "0");
    const formattedSeconds = String(remainingSeconds).padStart(2, "0");

    return `${formattedMinutes}:${formattedSeconds}`;
  }

  const handleBackgroundRemoval = async () => {
    console.log("removing background");
    if (!videoFile) {
      message.error("Please upload a video file first.");
      return;
    }

    setProcessing(true);

    // Trim video using ffmpeg
    const min = sliderValues[0];
    const max = sliderValues[1];
    console.log(
      formatTime((min / 100) * videoPlayerState.duration),
      formatTime((max / 100) * videoPlayerState.duration)
    );

    const inputPath = `input_${Date.now()}.mp4`; // Temporary input file name
    ffmpeg.FS("writeFile", inputPath, await fetchFile(videoFile));

    // Run ffmpeg commands

    await ffmpeg.run(
      "-i",
      inputPath,
      "-ss",
      formatTime((1 / speed) * (min / 100) * videoPlayerState.duration),
      "-to",
      formatTime((1 / speed) * (max / 100) * videoPlayerState.duration),
      "-filter:v",
      `setpts=${1 / speed}*PTS`,
      "output.mp4"
    );

    const outputData = ffmpeg.FS("readFile", "output.mp4");
    const trimmedVideoFile = new File(
      [outputData.buffer],
      "trimmed_video.mp4",
      { type: "video/mp4" }
    );
    setVideoFile(trimmedVideoFile);

    const formdata = new FormData();
    formdata.append("video_url", "");
    formdata.append("video_file", trimmedVideoFile, "file.mp4");
    formdata.append("format", "mp4");
    formdata.append("background_color", "FF0000");
    formdata.append("webhook_url", "");

    try {
      const response = await axios.post(
        "https://api.unscreen.com/v1.0/videos",
        formdata,
        {
          headers: {
            "X-Api-Key": process.env.API_KEY,
          },
        }
      );
      console.log(response?.data?.data, "response");
      setEditedVideoId(response?.data?.data?.id);
      const intervalId = setInterval(() => {
        fetchVideoInfo(response?.data?.data?.id);
      }, 1000);
      setIntervalId(intervalId);
    } catch (error) {
      message.error("Background removal failed. Please try again.");
      console.error("error", error);
    } finally {
      setProcessing(false);
    }
  };

  const downloadVideo = () => {
    message.info("Downloading video...");
    const videoUrl = editedVideoUrl;
    // Create a temporary anchor element
    const anchor = document.createElement("a");
    anchor.href = videoUrl;

    // anchor.target = "_blank";
    anchor.download = "video.mp4"; // Set the desired file name here

    // Append the anchor to the body
    document.body.appendChild(anchor);

    // Click the anchor to start downloading
    anchor.click();

    // Remove the anchor from the body
    document.body.removeChild(anchor);
  };

  const fetchVideoInfo = async (videoId) => {
    try {
      console.log(videoId);
      const response = await axios.get(
        `https://api.unscreen.com/v1.0/videos/${videoId}`,
        {
          headers: {
            "X-Api-Key": process.env.API_KEY,
          },
        }
      );

      const res = response?.data?.data?.attributes;

      setEtaSeconds(res?.eta_seconds);
      setIsBackgroundRemoved(res?.status === "done");
      if (res?.status === "done") {
        setEditedVideoUrl(res?.result_url);
      }

      if (res?.progress === 100) {
        message.success("Video is ready to download!");
        clearInterval(intervalId);
      }

      setProgress(res?.progress);

      console.log(response?.data?.data, "response");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      <Spin
        spinning={processing || !ffmpegLoaded}
        tip={!ffmpegLoaded ? "Waiting for FFmpeg to load..." : "Processing..."}
      >
        <div>
          {videoFile ? (
            <VideoPlayer
              src={URL.createObjectURL(videoFile)}
              onPlayerChange={(videoPlayer) => {
                setVideoPlayer(videoPlayer);
              }}
              onChange={(videoPlayerState) => {
                setVideoPlayerState(videoPlayerState);
              }}
            />
          ) : (
            <h1>Upload a video</h1>
          )}
        </div>
        <div className={"upload-div"}>
          <VideoUpload
            disabled={!!videoFile}
            onChange={(videoFile) => {
              setVideoFile(videoFile);
            }}
            onRemove={() => {
              setVideoFile(undefined);
            }}
          />
        </div>
        <div className={"slider-div"}>
          <h3>Cut Video</h3>
          <Slider
            disabled={!videoPlayerState}
            value={sliderValues}
            range={true}
            onChange={(values) => {
              setSliderValues(values);
            }}
            tooltip={{
              formatter: null,
            }}
          />
        </div>
        <div className={"speed-div"} style={{ marginBottom: "10px" }}>
          <h3>Speed</h3>
          <Select
            value={speed}
            disabled={!videoPlayerState}
            onChange={(value) => setSpeed(value)}
            style={{ width: 120 }}
          >
            <Option value={0.25}>0.25x</Option>
            <Option value={0.5}>0.5x</Option>
            <Option value={1}>1x</Option>
            <Option value={2}>2x</Option>
            <Option value={3}>3x</Option>
          </Select>
        </div>
        <div className={"button-div"}>
          <Button
            type="primary"
            disabled={!videoFile || processing}
            onClick={handleBackgroundRemoval}
            style={{ marginRight: "10px" }}
          >
            Remove background
          </Button>
          <Button disabled={!isBackgroundRemoved} onClick={downloadVideo}>
            Download video
          </Button>
          {editedVideoId && (
            <>
              <Progress percent={progress} />
              <div>
                Estimated time :{" "}
                {etaSeconds !== null ? `${etaSeconds} seconds` : "Caluculating"}
              </div>
            </>
          )}
        </div>
      </Spin>
    </div>
  );
}

export default VideoEditor;

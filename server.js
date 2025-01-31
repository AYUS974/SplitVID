const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const archiver = require('archiver');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.static('public'));

// Route to handle video upload and splitting
app.post('/split-video', upload.single('video'), (req, res) => {
  const videoPath = req.file.path;
  const outputDir = 'output/';
  const splitDuration = req.body.duration || 15; // Default to 15 seconds

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Generate a unique folder for this upload
  const uploadId = Date.now();
  const userOutputDir = path.join(outputDir, uploadId.toString());
  fs.mkdirSync(userOutputDir);

  // Split video using FFmpeg
  ffmpeg(videoPath)
    .output(path.join(userOutputDir, 'clip-%03d.mp4'))
    .outputOptions([`-f segment`, `-segment_time ${splitDuration}`, `-reset_timestamps 1`])
    .on('end', () => {
      // Get list of generated clips
      const clips = fs.readdirSync(userOutputDir);

      // Generate downloadable links
      const clipLinks = clips.map((clip) => ({
        name: clip,
        url: `/download/${uploadId}/${clip}`,
        previewUrl: `/preview/${uploadId}/${clip}`,
      }));

      res.json({ message: 'Video split successfully!', clips: clipLinks, uploadId });
    })
    .on('error', (err) => {
      res.status(500).json({ error: 'Error splitting video', details: err.message });
    })
    .run();
});

// Route to handle file downloads
app.get('/download/:uploadId/:filename', (req, res) => {
  const { uploadId, filename } = req.params;
  const filePath = path.join(__dirname, 'output', uploadId, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath, filename); // Trigger file download
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Route to handle ZIP downloads
app.get('/download-zip/:uploadId', (req, res) => {
  const { uploadId } = req.params;
  const userOutputDir = path.join(__dirname, 'output', uploadId);

  if (!fs.existsSync(userOutputDir)) {
    return res.status(404).json({ error: 'Files not found' });
  }

  const zipFilePath = path.join(__dirname, 'output', `${uploadId}.zip`);
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    res.download(zipFilePath, `clips-${uploadId}.zip`, () => {
      fs.unlinkSync(zipFilePath); // Delete the ZIP file after download
    });
  });

  archive.on('error', (err) => {
    res.status(500).json({ error: 'Error creating ZIP file', details: err.message });
  });

  archive.pipe(output);
  archive.directory(userOutputDir, false);
  archive.finalize();
});

// Route to serve video previews
app.get('/preview/:uploadId/:filename', (req, res) => {
  const { uploadId, filename } = req.params;
  const filePath = path.join(__dirname, 'output', uploadId, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath); // Stream the video for preview
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
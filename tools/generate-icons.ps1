$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Split-Path -Parent $root
$iconsDir = Join-Path $project 'icons'

$src1 = Join-Path $project 'team7712_logo_reefscape.png'
$src2 = Join-Path $project 'team7712_logo.png'
$src = $null
if (Test-Path $src1) { $src = $src1 } elseif (Test-Path $src2) { $src = $src2 } else { throw 'Source logo not found in project root.' }

New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function Resize-Image($srcPath, $destPath, $width, $height) {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    try {
        $bmp = New-Object System.Drawing.Bitmap $width, $height
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.DrawImage($img, 0, 0, $width, $height)
        } finally {
            $g.Dispose()
        }
        $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $bmp.Dispose()
        $img.Dispose()
    }
}

Resize-Image $src (Join-Path $iconsDir 'icon-192.png') 192 192
Resize-Image $src (Join-Path $iconsDir 'icon-512.png') 512 512

'Icons generated: ' + (Join-Path $iconsDir 'icon-192.png')
'Icons generated: ' + (Join-Path $iconsDir 'icon-512.png')

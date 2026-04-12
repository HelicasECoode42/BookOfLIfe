import AVFoundation
import Capacitor
import Foundation
import Speech

@objc(SpeechRecognition)
public class SpeechRecognition: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechRecognition"
    public let jsName = "SpeechRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedLanguages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]

    private let defaultMatches = 5
    private let messageMissingPermission = "Missing permission"
    private let messageAccessDeniedMicrophone = "User denied access to microphone"
    private let messageOngoing = "Ongoing speech recognition"
    private let messageUnknown = "Unknown error occured"

    private var speechRecognizer: SFSpeechRecognizer?
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var latestMatches: [String] = []

    private func resolveError(_ call: CAPPluginCall, message: String) {
        call.resolve(["error": message, "matches": []])
    }

    private func stopRecognition(notify: Bool = true, cancelTask: Bool = true) {
        audioEngine?.stop()
        recognitionRequest?.endAudio()

        if let inputNode = audioEngine?.inputNode {
            inputNode.removeTap(onBus: 0)
        }

        if cancelTask {
            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = nil
        }

        audioEngine = nil

        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("[SpeechRecognition] Failed to deactivate audio session: \(error.localizedDescription)")
        }

        if notify {
            notifyListeners("listeningState", data: ["status": "stopped"])
        }
    }

    private func notifyRecognitionError(_ error: NSError) {
        notifyListeners("speechError", data: [
            "message": error.localizedDescription,
            "code": error.code,
            "domain": error.domain
        ])
    }

    @objc public func available(_ call: CAPPluginCall) {
        let language = call.getString("language", "zh-CN")
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
            call.resolve([
                "available": false,
                "reason": "Speech recognizer is unavailable for \(language)"
            ])
            return
        }
        call.resolve([
            "available": recognizer.isAvailable,
            "locale": language,
            "supportsOnDeviceRecognition": recognizer.supportsOnDeviceRecognition
        ])
    }

    @objc public func start(_ call: CAPPluginCall) {
        if let engine = audioEngine, engine.isRunning {
            resolveError(call, message: messageOngoing)
            return
        }

        let status = SFSpeechRecognizer.authorizationStatus()
        if status != .authorized {
            resolveError(call, message: messageMissingPermission)
            return
        }

        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            if !granted {
                self.resolveError(call, message: self.messageAccessDeniedMicrophone)
                return
            }

            DispatchQueue.main.async {
                let language = call.getString("language", "zh-CN")
                let maxResults = call.getInt("maxResults", self.defaultMatches)
                let partialResults = call.getBool("partialResults", true)
                let requiresOnDevice = call.getBool("requiresOnDevice", false)

                self.stopRecognition(notify: false)
                self.latestMatches = []

                guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
                    self.resolveError(call, message: "Speech recognizer is unavailable for \(language)")
                    return
                }

                guard recognizer.isAvailable else {
                    self.resolveError(call, message: "Speech recognizer is currently unavailable")
                    return
                }

                self.speechRecognizer = recognizer
                self.audioEngine = AVAudioEngine()

                let audioSession = AVAudioSession.sharedInstance()
                do {
                    try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
                    try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
                } catch {
                    self.resolveError(call, message: "Microphone is already in use by another application.")
                    return
                }

                self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
                self.recognitionRequest?.shouldReportPartialResults = partialResults
                if #available(iOS 13.0, *) {
                    self.recognitionRequest?.requiresOnDeviceRecognition = requiresOnDevice && recognizer.supportsOnDeviceRecognition
                }

                guard let recognitionRequest = self.recognitionRequest, let audioEngine = self.audioEngine else {
                    self.resolveError(call, message: self.messageUnknown)
                    return
                }

                let inputNode = audioEngine.inputNode
                let format = inputNode.outputFormat(forBus: 0)
                inputNode.removeTap(onBus: 0)

                self.recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { result, error in
                    if let result {
                        var matches: [String] = []
                        for (index, transcription) in result.transcriptions.enumerated() where index < maxResults || maxResults <= 0 {
                            matches.append(transcription.formattedString)
                        }
                        self.latestMatches = matches

                        self.notifyListeners("partialResults", data: [
                            "matches": matches,
                            "isFinal": result.isFinal
                        ])

                        if result.isFinal {
                            self.notifyListeners("finalResult", data: [
                                "matches": matches
                            ])
                            self.stopRecognition()
                        }
                    }

                    if let error = error as NSError? {
                        self.notifyRecognitionError(error)
                        self.stopRecognition()
                    }
                }

                inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                    self.recognitionRequest?.append(buffer)
                }

                audioEngine.prepare()
                do {
                    try audioEngine.start()
                    self.notifyListeners("listeningState", data: [
                        "status": "started",
                        "locale": language,
                        "supportsOnDeviceRecognition": recognizer.supportsOnDeviceRecognition
                    ])
                    call.resolve([
                        "status": "started",
                        "listening": true,
                        "locale": language,
                        "supportsOnDeviceRecognition": recognizer.supportsOnDeviceRecognition
                    ])
                } catch {
                    self.resolveError(call, message: self.messageUnknown)
                }
            }
        }
    }

    @objc public func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let matches = self.latestMatches
            self.audioEngine?.stop()
            self.recognitionRequest?.endAudio()
            if let inputNode = self.audioEngine?.inputNode {
                inputNode.removeTap(onBus: 0)
            }

            self.notifyListeners("listeningState", data: ["status": "stopped"])

            if !matches.isEmpty {
                self.notifyListeners("finalResult", data: ["matches": matches])
            }

            self.recognitionTask?.cancel()
            self.recognitionTask = nil
            self.recognitionRequest = nil
            self.audioEngine = nil

            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                print("[SpeechRecognition] Failed to deactivate audio session: \(error.localizedDescription)")
            }

            call.resolve([
                "matches": matches,
                "status": "stopped"
            ])
        }
    }

    @objc public func getSupportedLanguages(_ call: CAPPluginCall) {
        let supportedLanguages = SFSpeechRecognizer.supportedLocales().map(\.identifier)
        call.resolve(["languages": supportedLanguages])
    }

    @objc public func isListening(_ call: CAPPluginCall) {
        call.resolve(["listening": audioEngine?.isRunning ?? false])
    }

    @objc public func hasPermission(_ call: CAPPluginCall) {
        checkPermissions(call)
    }

    @objc public func requestPermission(_ call: CAPPluginCall) {
        requestPermissions(call)
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        let status = SFSpeechRecognizer.authorizationStatus()
        let permission: String
        switch status {
        case .authorized:
            permission = "granted"
        case .denied, .restricted:
            permission = "denied"
        case .notDetermined:
            permission = "prompt"
        @unknown default:
            permission = "prompt"
        }
        call.resolve(["speechRecognition": permission])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                switch status {
                case .authorized:
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        call.resolve(["speechRecognition": granted ? "granted" : "denied"])
                    }
                case .denied, .restricted, .notDetermined:
                    self.checkPermissions(call)
                @unknown default:
                    self.checkPermissions(call)
                }
            }
        }
    }
}

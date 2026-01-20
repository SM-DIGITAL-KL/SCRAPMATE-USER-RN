import UIKit
import CoreLocation
import React

@objc(NativeMapViewModule)
class NativeMapViewModule: RCTEventEmitter {
    private var locationManager: CLLocationManager?
    private var currentLocation: CLLocation?
    private var locationPromise: RCTPromiseResolveBlock?
    private var permissionPromise: RCTPromiseResolveBlock?
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String]! {
        return []
    }
    
    @objc
    func requestLocationPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("ERROR", "Module deallocated", nil)
                return
            }
            
            if self.locationManager == nil {
                self.locationManager = CLLocationManager()
                self.locationManager?.delegate = self
            }
            
            let status = CLLocationManager.authorizationStatus()
            
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                self.startLocationUpdates()
                resolve(true)
            } else if status == .notDetermined {
                self.permissionPromise = resolve
                self.locationManager?.requestWhenInUseAuthorization()
            } else {
                // Permission denied
                resolve(false)
            }
        }
    }
    
    @objc
    func getCurrentLocation(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("ERROR", "Module deallocated", nil)
                return
            }
            
            if let location = self.currentLocation {
                let locationMap: [String: Any] = [
                    "latitude": location.coordinate.latitude,
                    "longitude": location.coordinate.longitude,
                    "accuracy": location.horizontalAccuracy,
                    "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
                    "heading": location.course >= 0 ? location.course : 0.0
                ]
                resolve(locationMap)
            } else {
                // Try to get location if permission is granted
                let status = CLLocationManager.authorizationStatus()
                if status == .authorizedWhenInUse || status == .authorizedAlways {
                    if self.locationManager == nil {
                        self.locationManager = CLLocationManager()
                        self.locationManager?.delegate = self
                    }
                    self.locationPromise = resolve
                    self.startLocationUpdates()
                } else {
                    reject("NO_LOCATION", "Location not available. Please request permission first.", nil)
                }
            }
        }
    }
    
    @objc
    func getAddressFromCoordinates(_ latitude: NSNumber, longitude: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Use OpenStreetMap Nominatim API (free, no API key required)
        let lat = latitude.doubleValue
        let lon = longitude.doubleValue
        let urlString = "https://nominatim.openstreetmap.org/reverse?format=json&lat=\(lat)&lon=\(lon)&zoom=18&addressdetails=1"
        
        guard let url = URL(string: urlString) else {
            reject("INVALID_URL", "Invalid URL", nil)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("ScrapmatePartner/1.0", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 10.0
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            
            if let error = error {
                DispatchQueue.main.async {
                    reject("NETWORK_ERROR", "Network error: \(error.localizedDescription)", error)
                }
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200,
                  let data = data else {
                DispatchQueue.main.async {
                    reject("API_ERROR", "Failed to fetch address", nil)
                }
                return
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let address = json["address"] as? [String: Any] {
                    
                    let formattedAddress = json["display_name"] as? String ?? ""
                    
                    // Extract address components
                    var addressMap: [String: Any] = [:]
                    addressMap["formattedAddress"] = formattedAddress
                    addressMap["houseNumber"] = address["house_number"] as? String ?? ""
                    addressMap["road"] = address["road"] as? String ?? ""
                    addressMap["neighborhood"] = address["neighbourhood"] as? String ?? ""
                    addressMap["suburb"] = address["suburb"] as? String ?? ""
                    
                    // Try city, then town, then village
                    let city = address["city"] as? String ?? 
                               address["town"] as? String ?? 
                               address["village"] as? String ?? ""
                    addressMap["city"] = city
                    addressMap["state"] = address["state"] as? String ?? ""
                    addressMap["postcode"] = address["postcode"] as? String ?? ""
                    addressMap["country"] = address["country"] as? String ?? ""
                    addressMap["countryCode"] = address["country_code"] as? String ?? ""
                    
                    // Build simple address string
                    var addressParts: [String] = []
                    if let houseNumber = address["house_number"] as? String, !houseNumber.isEmpty {
                        addressParts.append(houseNumber)
                    }
                    if let road = address["road"] as? String, !road.isEmpty {
                        addressParts.append(road)
                    }
                    if let suburb = address["suburb"] as? String, !suburb.isEmpty {
                        addressParts.append(suburb)
                    }
                    if !city.isEmpty {
                        addressParts.append(city)
                    }
                    if let state = address["state"] as? String, !state.isEmpty {
                        addressParts.append(state)
                    }
                    if let postcode = address["postcode"] as? String, !postcode.isEmpty {
                        addressParts.append(postcode)
                    }
                    
                    let simpleAddress = addressParts.isEmpty ? formattedAddress : addressParts.joined(separator: ", ")
                    addressMap["address"] = simpleAddress
                    
                    DispatchQueue.main.async {
                        resolve(addressMap)
                    }
                } else {
                    DispatchQueue.main.async {
                        reject("NO_ADDRESS", "Address not found for this location", nil)
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    reject("PARSE_ERROR", "Failed to parse address: \(error.localizedDescription)", error)
                }
            }
        }
        
        task.resume()
    }
    
    @objc
    func centerOnCurrentLocation(_ node: NSNumber) {
        // This is handled by the view manager, but we keep it for compatibility
        // The actual implementation is in NativeMapViewManager
    }
    
    private func startLocationUpdates() {
        guard let locationManager = locationManager else { return }
        
        let status = CLLocationManager.authorizationStatus()
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            return
        }
        
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 10 // Update every 10 meters
        locationManager.startUpdatingLocation()
    }
}

extension NativeMapViewModule: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        currentLocation = location
        
        // Resolve promise if waiting for location
        if let promise = locationPromise {
            let locationMap: [String: Any] = [
                "latitude": location.coordinate.latitude,
                "longitude": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy,
                "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
                "heading": location.course >= 0 ? location.course : 0.0
            ]
            promise(locationMap)
            locationPromise = nil
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error.localizedDescription)")
        if let promise = locationPromise {
            // We can't reject from here, so we'll just clear it
            locationPromise = nil
        }
    }
    
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            startLocationUpdates()
            if let promise = permissionPromise {
                promise(true)
                permissionPromise = nil
            }
        } else if status == .denied || status == .restricted {
            if let promise = permissionPromise {
                promise(false)
                permissionPromise = nil
            }
        }
    }
}

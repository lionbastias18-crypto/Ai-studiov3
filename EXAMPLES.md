# 📋 Examples and Code Snippets

> **Common customizations and code examples for your Android app**

This document provides practical examples of how to modify and extend your Android app.

## 🎨 UI Customization Examples

### Change App Colors

#### Dark Theme Colors
```xml
<!-- app/src/main/res/values/colors.xml -->
<resources>
    <color name="primary_text">#FFFFFF</color>           <!-- White text -->
    <color name="secondary_text">#CCCCCC</color>         <!-- Light gray -->
    <color name="button_color">#FF6200EE</color>         <!-- Purple button -->
    <color name="background_color">#FF121212</color>     <!-- Dark background -->
</resources>
```

#### Material Design Colors
```xml
<!-- app/src/main/res/values/colors.xml -->
<resources>
    <color name="primary_text">#FF1976D2</color>         <!-- Material Blue -->
    <color name="secondary_text">#FF757575</color>       <!-- Material Gray -->
    <color name="button_color">#FF4CAF50</color>         <!-- Material Green -->
    <color name="background_color">#FFFAFAFA</color>     <!-- Light Background -->
</resources>
```

### Custom Text Content

#### Multilingual Support
```xml
<!-- app/src/main/res/values/strings.xml (English) -->
<resources>
    <string name="app_name">My App</string>
    <string name="welcome_message">Welcome to My App!</string>
    <string name="click_me">Click Me!</string>
    <string name="button_clicked">Button clicked %d times</string>
</resources>
```

```xml
<!-- app/src/main/res/values-es/strings.xml (Spanish) -->
<resources>
    <string name="app_name">Mi Aplicación</string>
    <string name="welcome_message">¡Bienvenido a Mi Aplicación!</string>
    <string name="click_me">¡Haz Clic!</string>
    <string name="button_clicked">Botón presionado %d veces</string>
</resources>
```

### Layout Modifications

#### Add Image to Layout
```xml
<!-- app/src/main/res/layout/activity_main.xml -->
<ImageView
    android:id="@+id/logoImage"
    android:layout_width="120dp"
    android:layout_height="120dp"
    android:src="@drawable/ic_launcher"
    android:layout_marginBottom="32dp"
    app:layout_constraintEnd_toEndOf="parent"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintBottom_toTopOf="@+id/welcomeText" />
```

#### Add Input Field
```xml
<!-- Add this to your layout -->
<EditText
    android:id="@+id/nameInput"
    android:layout_width="0dp"
    android:layout_height="56dp"
    android:layout_marginStart="32dp"
    android:layout_marginEnd="32dp"
    android:layout_marginTop="16dp"
    android:hint="Enter your name"
    android:inputType="textPersonName"
    android:background="@drawable/input_background"
    android:padding="16dp"
    app:layout_constraintEnd_toEndOf="parent"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintTop_toBottomOf="@+id/welcomeText" />
```

## 💻 Kotlin Code Examples

### Enhanced MainActivity

#### Add Name Personalization
```kotlin
// app/src/main/java/com/example/sampleapp/MainActivity.kt
package com.example.sampleapp

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.EditText
import android.widget.Toast

class MainActivity : AppCompatActivity() {
    private var clickCount = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val welcomeText = findViewById<TextView>(R.id.welcomeText)
        val nameInput = findViewById<EditText>(R.id.nameInput)
        val clickButton = findViewById<Button>(R.id.clickButton)
        val countText = findViewById<TextView>(R.id.countText)

        clickButton.setOnClickListener {
            clickCount++
            val name = nameInput.text.toString().trim()
            val displayName = if (name.isNotEmpty()) name else "User"
            
            countText.text = "Hello $displayName! Button clicked $clickCount times"
            
            when {
                clickCount % 10 == 0 -> {
                    Toast.makeText(this, "🎉 Amazing! $clickCount clicks!", Toast.LENGTH_LONG).show()
                }
                clickCount % 5 == 0 -> {
                    Toast.makeText(this, "⭐ Great job! $clickCount clicks!", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
```

#### Add Reset Functionality
```kotlin
class MainActivity : AppCompatActivity() {
    private var clickCount = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val clickButton = findViewById<Button>(R.id.clickButton)
        val resetButton = findViewById<Button>(R.id.resetButton)
        val countText = findViewById<TextView>(R.id.countText)

        clickButton.setOnClickListener {
            clickCount++
            updateDisplay()
        }

        resetButton.setOnClickListener {
            clickCount = 0
            updateDisplay()
            Toast.makeText(this, "Counter reset!", Toast.LENGTH_SHORT).show()
        }
    }

    private fun updateDisplay() {
        val countText = findViewById<TextView>(R.id.countText)
        countText.text = "Button clicked $clickCount times"
    }
}
```

### Data Persistence Example

#### Save Counter State
```kotlin
import android.content.SharedPreferences

class MainActivity : AppCompatActivity() {
    private var clickCount = 0
    private lateinit var sharedPref: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize SharedPreferences
        sharedPref = getSharedPreferences("app_prefs", MODE_PRIVATE)
        
        // Load saved count
        clickCount = sharedPref.getInt("click_count", 0)
        
        setupUI()
    }

    private fun setupUI() {
        val clickButton = findViewById<Button>(R.id.clickButton)
        val countText = findViewById<TextView>(R.id.countText)

        updateDisplay()

        clickButton.setOnClickListener {
            clickCount++
            updateDisplay()
            saveCount()
        }
    }

    private fun updateDisplay() {
        val countText = findViewById<TextView>(R.id.countText)
        countText.text = "Button clicked $clickCount times"
    }

    private fun saveCount() {
        with(sharedPref.edit()) {
            putInt("click_count", clickCount)
            apply()
        }
    }
}
```

## 🌐 Network Integration Examples

### Add Internet Permission
```xml
<!-- app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
```

### Fetch Data from API
```kotlin
// Add to app/build.gradle dependencies
implementation 'com.squareup.retrofit2:retrofit:2.9.0'
implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
```

```kotlin
// MainActivity.kt - Simple API call example
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class MainActivity : AppCompatActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        val fetchButton = findViewById<Button>(R.id.fetchButton)
        val resultText = findViewById<TextView>(R.id.resultText)
        
        fetchButton.setOnClickListener {
            fetchJoke(resultText)
        }
    }
    
    private fun fetchJoke(textView: TextView) {
        val retrofit = Retrofit.Builder()
            .baseUrl("https://api.chucknorris.io/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            
        val service = retrofit.create(JokeService::class.java)
        
        service.getRandomJoke().enqueue(object : Callback<JokeResponse> {
            override fun onResponse(call: Call<JokeResponse>, response: Response<JokeResponse>) {
                if (response.isSuccessful) {
                    textView.text = response.body()?.value ?: "No joke found"
                }
            }
            
            override fun onFailure(call: Call<JokeResponse>, t: Throwable) {
                textView.text = "Failed to fetch joke: ${t.message}"
            }
        })
    }
}

// Data classes and service interface
data class JokeResponse(val value: String)

interface JokeService {
    @GET("jokes/random")
    fun getRandomJoke(): Call<JokeResponse>
}
```

## 🎨 Advanced UI Examples

### Custom Button Styles
```xml
<!-- app/src/main/res/drawable/custom_button.xml -->
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="@color/button_color" />
    <corners android:radius="24dp" />
    <stroke android:width="2dp" android:color="@color/primary_text" />
</shape>
```

```xml
<!-- Use in your layout -->
<Button
    android:id="@+id/clickButton"
    android:layout_width="200dp"
    android:layout_height="56dp"
    android:text="@string/click_me"
    android:textSize="18sp"
    android:textColor="@android:color/white"
    android:background="@drawable/custom_button"
    android:elevation="4dp" />
```

### RecyclerView Example
```kotlin
// Add to dependencies
implementation 'androidx.recyclerview:recyclerview:1.3.2'
```

```kotlin
// Simple list adapter
class SimpleAdapter(private val items: List<String>) : 
    RecyclerView.Adapter<SimpleAdapter.ViewHolder>() {
    
    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val textView: TextView = view.findViewById(android.R.id.text1)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(android.R.layout.simple_list_item_1, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.textView.text = items[position]
    }
    
    override fun getItemCount() = items.size
}

// Usage in MainActivity
val recyclerView = findViewById<RecyclerView>(R.id.recyclerView)
val items = listOf("Item 1", "Item 2", "Item 3", "Item 4", "Item 5")
recyclerView.adapter = SimpleAdapter(items)
recyclerView.layoutManager = LinearLayoutManager(this)
```

## 🔧 Build Configuration Examples

### Add App Icon
```gradle
// app/build.gradle - Custom app icon
android {
    defaultConfig {
        // ... other config
    }
    
    buildTypes {
        debug {
            applicationIdSuffix ".debug"
            versionNameSuffix "-DEBUG"
            resValue "string", "app_name", "My App (Debug)"
        }
        release {
            minifyEnabled false
            resValue "string", "app_name", "My App"
        }
    }
}
```

### Environment-Specific Builds
```gradle
// app/build.gradle - Multiple build variants
android {
    flavorDimensions "environment"
    
    productFlavors {
        dev {
            dimension "environment"
            applicationIdSuffix ".dev"
            versionNameSuffix "-dev"
            buildConfigField "String", "API_BASE_URL", '"https://api-dev.example.com"'
        }
        
        prod {
            dimension "environment"
            buildConfigField "String", "API_BASE_URL", '"https://api.example.com"'
        }
    }
}
```

## 🧪 Testing Examples

### Simple Unit Tests
```kotlin
// app/src/test/java/com/example/sampleapp/MainActivityTest.kt
import org.junit.Test
import org.junit.Assert.*

class MainActivityTest {
    
    @Test
    fun addition_isCorrect() {
        assertEquals(4, 2 + 2)
    }
    
    @Test
    fun button_click_increments_counter() {
        var counter = 0
        counter++
        assertEquals(1, counter)
    }
}
```

### UI Tests
```kotlin
// app/src/androidTest/java/com/example/sampleapp/MainActivityUITest.kt
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityUITest {
    
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)
    
    @Test
    fun button_click_updates_text() {
        // Click the button
        onView(withId(R.id.clickButton)).perform(click())
        
        // Check that the counter text updated
        onView(withId(R.id.countText))
            .check(matches(withText(containsString("1"))))
    }
}
```

## 📱 Different App Templates

### Calculator App Template
```kotlin
class CalculatorActivity : AppCompatActivity() {
    private var currentNumber = ""
    private var operator = ""
    private var previousNumber = ""
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_calculator)
        
        setupNumberButtons()
        setupOperatorButtons()
    }
    
    private fun setupNumberButtons() {
        val numberButtons = listOf(
            R.id.btn0, R.id.btn1, R.id.btn2, R.id.btn3, R.id.btn4,
            R.id.btn5, R.id.btn6, R.id.btn7, R.id.btn8, R.id.btn9
        )
        
        numberButtons.forEachIndexed { index, buttonId ->
            findViewById<Button>(buttonId).setOnClickListener {
                appendNumber(index.toString())
            }
        }
    }
    
    private fun appendNumber(number: String) {
        currentNumber += number
        updateDisplay()
    }
    
    private fun updateDisplay() {
        findViewById<TextView>(R.id.display).text = currentNumber
    }
}
```

### Todo List App Template
```kotlin
class TodoActivity : AppCompatActivity() {
    private val todoItems = mutableListOf<String>()
    private lateinit var adapter: ArrayAdapter<String>
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_todo)
        
        val listView = findViewById<ListView>(R.id.todoList)
        val addButton = findViewById<Button>(R.id.addButton)
        val inputField = findViewById<EditText>(R.id.todoInput)
        
        adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, todoItems)
        listView.adapter = adapter
        
        addButton.setOnClickListener {
            val todoText = inputField.text.toString().trim()
            if (todoText.isNotEmpty()) {
                todoItems.add(todoText)
                adapter.notifyDataSetChanged()
                inputField.text.clear()
            }
        }
        
        listView.setOnItemLongClickListener { _, _, position, _ ->
            todoItems.removeAt(position)
            adapter.notifyDataSetChanged()
            true
        }
    }
}
```

## 🔄 GitHub Actions Customization

### Add Testing to Workflow
```yaml
# .github/workflows/android-build.yml
- name: Run Unit Tests
  run: ./gradlew test

- name: Run UI Tests
  run: ./gradlew connectedAndroidTest

- name: Upload Test Results
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-results
    path: app/build/test-results/
```

### Multiple APK Variants
```yaml
# .github/workflows/android-build.yml
- name: Build Debug APK
  run: ./gradlew assembleDebug

- name: Build Release APK
  run: ./gradlew assembleRelease

- name: Build Dev APK
  run: ./gradlew assembleDevDebug

- name: Upload All APKs
  uses: actions/upload-artifact@v4
  with:
    name: all-apks
    path: app/build/outputs/apk/**/*.apk
```

These examples should give you a solid foundation for customizing and extending your Android app. Mix and match these patterns to create exactly the app you envision!
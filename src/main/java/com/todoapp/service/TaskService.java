package com.todoapp.service;

import com.todoapp.model.Task;
import com.todoapp.repository.TaskRepository;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;

@Service
public class TaskService {

    private final TaskRepository taskRepository;

    public TaskService(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    /** Read path: served from the "allTasks" Redis cache when warm. */
    @Cacheable(value = "allTasks", key = "'all'")
    public List<Task> getAllTasks() {
        return taskRepository.findAll();
    }

    /** Read path: served from the "taskById" Redis cache when warm. */
    @Cacheable(value = "taskById", key = "#id")
    public Task getTask(Long id) {
        return taskRepository.findById(id).orElse(null);
    }

    /** Write path: always goes straight to RDS (via RDS Proxy), then invalidates caches. */
    @CacheEvict(value = "allTasks", allEntries = true)
    public Task createTask(Task task) {
        return taskRepository.save(task);
    }

    @Caching(evict = {
            @CacheEvict(value = "allTasks", allEntries = true),
            @CacheEvict(value = "taskById", key = "#id")
    })
    public Task updateTask(Long id, Task updates) {
        Task existing = taskRepository.findById(id).orElse(null);
        if (existing == null) {
            return null;
        }
        existing.setTitle(updates.getTitle());
        existing.setDescription(updates.getDescription());
        existing.setCompleted(updates.isCompleted());
        return taskRepository.save(existing);
    }

    @Caching(evict = {
            @CacheEvict(value = "allTasks", allEntries = true),
            @CacheEvict(value = "taskById", key = "#id")
    })
    public boolean deleteTask(Long id) {
        if (!taskRepository.existsById(id)) {
            return false;
        }
        taskRepository.deleteById(id);
        return true;
    }
}
